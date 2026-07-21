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

/** Runs arbitrary user-supplied SQL verbatim, with no interpolation. */
export function runQuery(db: RemoteDatabase, sql: string): Promise<Row[]> {
    return db.run<Row>(sql);
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
