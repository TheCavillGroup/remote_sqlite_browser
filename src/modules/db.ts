import { RemoteDatabase } from "@tangerie/remote-sqlite/client";
import { quoteIdent } from "./sqlIdent.ts";

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
    /** 0 = normal, 1 = hidden, 2 = virtual generated, 3 = stored generated. */
    hidden: number;
}

export interface SchemaObject {
    type: "table" | "view" | "index" | "trigger";
    name: string;
    tbl_name: string;
    sql: string | null;
}

export interface ExplainNode {
    id: number;
    parent: number;
    notused: number;
    detail: string;
}

export interface PageOpts {
    limit: number;
    offset: number;
}

export type Row = Record<string, unknown>;

export async function connect(url: string): Promise<RemoteDatabase> {
    const db = new RemoteDatabase(url);
    await db.open();
    return db;
}

export function listTables(db: RemoteDatabase): Promise<TableInfo[]> {
    return db.run<TableInfo>(
        "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
}

/**
 * Uses table_xinfo (not table_info) since table_info silently omits generated columns.
 * Still excludes hidden=1 columns (e.g. FTS5's implicit rank/pseudo-columns) — those aren't
 * real data columns, unlike hidden=2/3 (virtual/stored generated columns) which we keep.
 */
export async function getTableSchema(db: RemoteDatabase, table: string): Promise<ColumnInfo[]> {
    const columns = await db.run<ColumnInfo>(`PRAGMA table_xinfo(${quoteIdent(table)})`);
    return columns.filter((c) => c.hidden !== 1);
}

export async function getTableRowCount(db: RemoteDatabase, table: string): Promise<number> {
    const rows = await db.run<{ n: number }>(`SELECT COUNT(*) as n FROM ${quoteIdent(table)}`);
    return rows[0]?.n ?? 0;
}

export function getTableRows(db: RemoteDatabase, table: string, opts: PageOpts): Promise<Row[]> {
    return db.run<Row>(
        `SELECT * FROM ${quoteIdent(table)} LIMIT ? OFFSET ?`,
        opts.limit,
        opts.offset,
    );
}

/** Escape LIKE metacharacters so literal %, _ and \ in a search term are matched literally. */
function escapeLikeTerm(term: string): string {
    return term.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function buildSearchWhere(columns: string[]): string {
    return columns.map((c) => `CAST(${quoteIdent(c)} AS TEXT) LIKE ? ESCAPE '\\'`).join(" OR ");
}

export function searchTableRows(
    db: RemoteDatabase,
    table: string,
    columns: string[],
    term: string,
    opts: PageOpts,
): Promise<Row[]> {
    if (columns.length === 0 || term.trim() === "") {
        return getTableRows(db, table, opts);
    }
    const likeTerm = `%${escapeLikeTerm(term)}%`;
    const params = columns.map(() => likeTerm);
    return db.run<Row>(
        `SELECT * FROM ${quoteIdent(table)} WHERE ${buildSearchWhere(columns)} LIMIT ? OFFSET ?`,
        ...params,
        opts.limit,
        opts.offset,
    );
}

export async function searchTableRowCount(
    db: RemoteDatabase,
    table: string,
    columns: string[],
    term: string,
): Promise<number> {
    if (columns.length === 0 || term.trim() === "") {
        return getTableRowCount(db, table);
    }
    const likeTerm = `%${escapeLikeTerm(term)}%`;
    const params = columns.map(() => likeTerm);
    const rows = await db.run<{ n: number }>(
        `SELECT COUNT(*) as n FROM ${quoteIdent(table)} WHERE ${buildSearchWhere(columns)}`,
        ...params,
    );
    return rows[0]?.n ?? 0;
}

export const MAX_QUERY_ROWS = 1000;

/**
 * True when the statement carries its own top-level LIMIT, meaning the user has already bounded the
 * result and we leave it alone. This scans rather than parses: string literals, quoted identifiers
 * and comments are skipped so a stray "limit" inside one doesn't count, and anything inside
 * parentheses is a subquery or CTE whose LIMIT says nothing about how many rows come back.
 */
export function hasLimitClause(sql: string): boolean {
    let depth = 0;
    for (let i = 0; i < sql.length; i++) {
        const c = sql[i];
        if (c === "'" || c === '"' || c === "`") {
            i++;
            while (i < sql.length) {
                // A doubled quote is an escaped one, not the end of the literal.
                if (sql[i] === c) {
                    if (sql[i + 1] !== c) break;
                    i++;
                }
                i++;
            }
        } else if (c === "[") {
            while (i < sql.length && sql[i] !== "]") i++;
        } else if (c === "-" && sql[i + 1] === "-") {
            while (i < sql.length && sql[i] !== "\n") i++;
        } else if (c === "/" && sql[i + 1] === "*") {
            i += 2;
            while (i < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) i++;
            i++;
        } else if (c === "(") {
            depth++;
        } else if (c === ")") {
            depth--;
        } else if (depth === 0 && (c === "l" || c === "L")) {
            const before = i === 0 ? " " : sql[i - 1];
            const after = sql[i + 5] ?? " ";
            if (
                sql.slice(i, i + 5).toLowerCase() === "limit" &&
                !/[\w$]/.test(before) && !/[\w$]/.test(after)
            ) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Runs sql capped at `limit` rows. Wraps the statement as a subquery so the cap applies at the
 * server; falls back to running it raw (then slicing) for statements that can't be wrapped — PRAGMA,
 * DML, etc. A wrap failure is a prepare failure, so the statement never ran and the fallback
 * executes it exactly once. Returns up to limit + 1 rows so callers can detect truncation. `limit`
 * is an internal constant, never user input, so interpolation is safe.
 */
async function runCapped(db: RemoteDatabase, sql: string, limit: number): Promise<Row[]> {
    const trimmed = sql.replace(/;\s*$/, "").trim();
    try {
        return await db.run<Row>(`SELECT * FROM (\n${trimmed}\n) LIMIT ${limit + 1}`);
    } catch {
        const rows = await db.run<Row>(sql);
        return rows.slice(0, limit + 1);
    }
}

/**
 * Runs arbitrary user-supplied SQL. A statement with its own LIMIT runs verbatim and uncapped —
 * the user has said how many rows they want. Everything else is capped at MAX_QUERY_ROWS.
 */
export function runQuery(db: RemoteDatabase, sql: string): Promise<Row[]> {
    return hasLimitClause(sql) ? db.run<Row>(sql) : runCapped(db, sql, MAX_QUERY_ROWS);
}

/** Sample rows from an arbitrary query for TS type inference. Always capped — a user LIMIT of a
 * million rows is still only 100 rows' worth of type information. */
export function sampleRowsForTypes(db: RemoteDatabase, sql: string, limit = 100): Promise<Row[]> {
    return runCapped(db, sql, limit);
}

/** Every table/view/index/trigger with its CREATE sql; excludes internal sqlite_* objects (incl. autoindexes). */
export function listSchemaObjects(db: RemoteDatabase): Promise<SchemaObject[]> {
    return db.run<SchemaObject>(
        "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
    );
}

/**
 * EXPLAIN QUERY PLAN for a single statement. The sql is prepended verbatim (same trust model
 * as runQuery — it's user-typed SQL from the "Run SQL" tab), not identifier-quoted.
 */
export function explainQueryPlan(db: RemoteDatabase, sql: string): Promise<ExplainNode[]> {
    return db.run<ExplainNode>(`EXPLAIN QUERY PLAN ${sql}`);
}

/** Table/view -> column names, for editor autocomplete. One query for the whole database. */
export async function getSchemaMap(db: RemoteDatabase): Promise<Record<string, string[]>> {
    const pairs = await db.run<{ tbl: string; col: string }>(
        "SELECT m.name AS tbl, p.name AS col FROM sqlite_master m " +
            "JOIN pragma_table_xinfo(m.name) p " +
            "WHERE m.type IN ('table','view') AND m.name NOT LIKE 'sqlite_%' AND p.hidden != 1 " +
            "ORDER BY m.name",
    );
    const map: Record<string, string[]> = {};
    for (const { tbl, col } of pairs) (map[tbl] ??= []).push(col);
    return map;
}
