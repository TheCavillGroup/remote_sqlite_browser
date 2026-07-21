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

export function getTableSchema(db: RemoteDatabase, table: string): Promise<ColumnInfo[]> {
    return db.run<ColumnInfo>(`PRAGMA table_info(${quoteIdent(table)})`);
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
