import { computed, signal } from "@preact/signals";
import { RemoteDatabase } from "@tangerie/remote-sqlite/client";
import {
    type ColumnInfo,
    connect,
    getTableSchema,
    listTables,
    searchTableRowCount,
    searchTableRows,
    type TableInfo,
} from "../modules/db.ts";

const LAST_URL_KEY = "remote-sqlite:last-url";
const RECENT_URLS_KEY = "remote-sqlite:recent-urls";

export const wsUrl = signal(localStorage.getItem(LAST_URL_KEY) ?? "ws://localhost:8090/sql");
export const db = signal<RemoteDatabase | null>(null);
export const connected = computed(() => db.value !== null);
export const connecting = signal(false);
export const connectError = signal<string | null>(null);

export const tables = signal<TableInfo[]>([]);
export const selectedTable = signal<string | null>(null);
export const selectedTableSchema = signal<ColumnInfo[]>([]);

export const activeTab = signal<"browse" | "query">("browse");

export const pageSize = signal(50);
export const pageOffset = signal(0);
export const searchTerm = signal("");
export const rows = signal<Record<string, unknown>[]>([]);
export const totalRows = signal(0);
export const rowsLoading = signal(false);
export const rowsError = signal<string | null>(null);

export const querySql = signal("SELECT * FROM sqlite_master;");
export const queryResult = signal<Record<string, unknown>[] | null>(null);
export const queryColumns = signal<string[]>([]);
export const queryError = signal<string | null>(null);
export const queryLoading = signal(false);

export const recentUrls = signal<string[]>(
    JSON.parse(localStorage.getItem(RECENT_URLS_KEY) ?? "[]"),
);

function rememberUrl(url: string) {
    const next = [url, ...recentUrls.value.filter((u) => u !== url)].slice(0, 10);
    recentUrls.value = next;
    localStorage.setItem(RECENT_URLS_KEY, JSON.stringify(next));
    localStorage.setItem(LAST_URL_KEY, url);
}

function resetTableState() {
    selectedTable.value = null;
    selectedTableSchema.value = [];
    pageOffset.value = 0;
    searchTerm.value = "";
    rows.value = [];
    totalRows.value = 0;
    rowsError.value = null;
}

export async function connectTo(url: string) {
    connecting.value = true;
    connectError.value = null;
    try {
        const conn = await connect(url);
        db.value = conn;
        rememberUrl(url);
        tables.value = await listTables(conn);
        resetTableState();
        activeTab.value = "browse";
    } catch (err) {
        db.value = null;
        connectError.value = String(err);
    } finally {
        connecting.value = false;
    }
}

export function disconnect() {
    db.value?.close();
    db.value = null;
    tables.value = [];
    resetTableState();
}

export async function loadTable(name: string) {
    selectedTable.value = name;
    pageOffset.value = 0;
    searchTerm.value = "";
    selectedTableSchema.value = [];
    activeTab.value = "browse";

    if (!db.value) return;
    try {
        selectedTableSchema.value = await getTableSchema(db.value, name);
    } catch (err) {
        rowsError.value = String(err);
    }
    await refreshTableRows();
}

export async function refreshTableRows() {
    const conn = db.value;
    const table = selectedTable.value;
    if (!conn || !table) return;

    rowsLoading.value = true;
    rowsError.value = null;
    try {
        const columns = selectedTableSchema.value.map((c) => c.name);
        const opts = { limit: pageSize.value, offset: pageOffset.value };
        const term = searchTerm.value;
        const [newRows, count] = await Promise.all([
            searchTableRows(conn, table, columns, term, opts),
            searchTableRowCount(conn, table, columns, term),
        ]);
        rows.value = newRows;
        totalRows.value = count;
    } catch (err) {
        rowsError.value = String(err);
    } finally {
        rowsLoading.value = false;
    }
}
