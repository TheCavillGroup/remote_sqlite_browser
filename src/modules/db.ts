import { RemoteDatabase } from "@tangerie/remote-sqlite/client";
import { quoteIdent } from "./sqlIdent.ts";

export const MAX_QUERY_ROWS = 1000;

const SCHEMA_OBJECT_TYPES = ["table", "view", "index", "trigger"] as const;
type SchemaObjectType =(typeof SCHEMA_OBJECT_TYPES)[number];

export interface TableInfo {
    name: string;
    type: string;
}

export interface ColumnInfo {
    cid: number;
    name: string;
    type: string;
    notnull: number;
    dflt_value: unknown;
    pk: number;
    /** 0 = normal, 1 = hidden, 2 = virtual generated, 3 = stored generated */
    hidden: number;
}

export interface SchemaObject {
    type: SchemaObjectType;
    name: string;
    tbl_name: string;
    sql: string | null;
}

export interface ExplainNode {
    id: number,
    parent: number,
    notused: number,
    detail: string
}

export interface PageOpts {
    limit: number;
    offset: number;
}

export type Row = Record<string, unknown>;

export async function connect(url : string) : Promise<RemoteDatabase> {
    const db = new RemoteDatabase(url);
    await db.open();
    return db;
}

export function listTables(db : RemoteDatabase) : Promise<TableInfo[]> {
    return db.run<TableInfo>(`--sql
        SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name`);
}

// table_info silently drops generated columns, hidden=1 is FTS5 pseudo-columns
export async function getTableSchema(db : RemoteDatabase, table : string) : Promise<ColumnInfo[]> {
    const columns = await db.run<ColumnInfo>(`PRAGMA table_xinfo(${quoteIdent(table)})`);
    return columns.filter(x => x.hidden !== 1);
}

export async function getTableRowCount(db : RemoteDatabase, table : string) : Promise<number> {
    const rows = await db.run<Record<"n", number>>(`SELECT COUNT(*) as n FROM ${quoteIdent(table)}`);
    return rows[0]?.n ?? 0;
}

export function getTableRows(db : RemoteDatabase, table : string, opts : PageOpts) : Promise<Row[]> {
    return db.run<Row>(`SELECT * FROM ${quoteIdent(table)} LIMIT ? OFFSET ?`, opts.limit, opts.offset);
}

const escapeLikeTerm = (term : string) => term.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");

const buildSearchWhere = (columns : string[]) => columns.map(x => `CAST(${quoteIdent(x)} AS TEXT) LIKE ? ESCAPE '\\'`).join(" OR ");

export function searchTableRows(db : RemoteDatabase, table : string, columns : string[], term : string, opts : PageOpts) : Promise<Row[]> {
    if(columns.length === 0 || term.trim() === "") return getTableRows(db, table, opts);

    const likeTerm = `%${escapeLikeTerm(term)}%`;
    const params = columns.map(() => likeTerm);
    return db.run<Row>(
        `SELECT * FROM ${quoteIdent(table)} WHERE ${buildSearchWhere(columns)} LIMIT ? OFFSET ?`,
        ...params,
        opts.limit,
        opts.offset
    );
}

export async function searchTableRowCount(db : RemoteDatabase, table : string, columns : string[], term : string) : Promise<number> {
    if(columns.length === 0 || term.trim() === "") return getTableRowCount(db, table);

    const likeTerm = `%${escapeLikeTerm(term)}%`;
    const params = columns.map(() => likeTerm);
    const rows = await db.run<Record<"n", number>>(
        `SELECT COUNT(*) as n FROM ${quoteIdent(table)} WHERE ${buildSearchWhere(columns)}`,
        ...params
    );
    return rows[0]?.n ?? 0;
}

// Scans rather than parses. Skips literals/identifiers/comments, and a LIMIT inside parens is a subquery so doesn't count
export function hasLimitClause(sql : string) : boolean {
    let depth = 0;
    for(let i = 0; i < sql.length; i++) {
        const c = sql[i];
        if(c === "'" || c === '"' || c === "`") {
            i++;
            while(i < sql.length) {
                // Doubled quote is an escape
                if(sql[i] === c) {
                    if(sql[i + 1] !== c) break;
                    i++;
                }
                i++;
            }
        } else if(c === "[") {
            while(i < sql.length && sql[i] !== "]") i++;
        } else if(c === "-" && sql[i + 1] === "-") {
            while(i < sql.length && sql[i] !== "\n") i++;
        } else if(c === "/" && sql[i + 1] === "*") {
            i += 2;
            while(i < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) i++;
            i++;
        } else if(c === "(") {
            depth++;
        } else if(c === ")") {
            depth--;
        } else if(depth === 0 && (c === "l" || c === "L")) {
            const before = i === 0 ? " " : sql[i - 1];
            const after = sql[i + 5] ?? " ";
            if(sql.slice(i, i + 5).toLowerCase() === "limit" && !/[\w$]/.test(before) && !/[\w$]/.test(after)) return true;
        }
    }
    return false;
}

// Returns up to limit + 1 rows so callers can detect truncation.
// If the wrap fails it failed at prepare, so the fallback only ever runs the statement once (PRAGMA, DML etc)
async function runCapped(db : RemoteDatabase, sql : string, limit : number) : Promise<Row[]> {
    const trimmed = sql.replace(/;\s*$/, "").trim();
    try {
        return await db.run<Row>(`SELECT * FROM (\n${trimmed}\n) LIMIT ${limit + 1}`);
    } catch {
        const rows = await db.run<Row>(sql);
        return rows.slice(0, limit + 1);
    }
}

export function runQuery(db : RemoteDatabase, sql : string) : Promise<Row[]> {
    return hasLimitClause(sql) ? db.run<Row>(sql) : runCapped(db, sql, MAX_QUERY_ROWS);
}

// Always capped, even with a user LIMIT
export function sampleRowsForTypes(db : RemoteDatabase, sql : string, limit = 100) : Promise<Row[]> {
    return runCapped(db, sql, limit);
}

export function listSchemaObjects(db : RemoteDatabase) : Promise<SchemaObject[]> {
    return db.run<SchemaObject>(`--sql
        SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`);
}

export function explainQueryPlan(db : RemoteDatabase, sql : string) : Promise<ExplainNode[]> {
    return db.run<ExplainNode>(`EXPLAIN QUERY PLAN ${sql}`);
}

export async function getSchemaMap(db : RemoteDatabase) : Promise<Record<string, string[]>> {
    const pairs = await db.run<Record<"tbl" | "col", string>>(`--sql
        SELECT m.name AS tbl, p.name AS col FROM sqlite_master m
        JOIN pragma_table_xinfo(m.name) p
        WHERE m.type IN ('table','view') AND m.name NOT LIKE 'sqlite_%' AND p.hidden != 1
        ORDER BY m.name`);

    const map : Record<string, string[]> = {};
    for(const { tbl, col } of pairs) (map[tbl] ??= []).push(col);
    return map;
}
