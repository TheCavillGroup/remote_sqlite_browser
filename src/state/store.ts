import { createStore, createUseStore } from "@tangerie/global-store";
import { RemoteDatabase } from "@tangerie/remote-sqlite/client";
import {
    type ColumnInfo,
    connect,
    type ExplainNode,
    explainQueryPlan,
    getSchemaMap,
    getTableSchema,
    listSchemaObjects,
    listTables,
    runQuery,
    type SchemaObject,
    searchTableRowCount,
    searchTableRows,
    type TableInfo,
} from "../modules/db.ts";

const LAST_URL_KEY = "remote-sqlite:last-url";
const RECENT_URLS_KEY = "remote-sqlite:recent-urls";

export type Tab = "structure" | "browse" | "query";

export type ConnStatus = "idle" | "connecting" | "connected" | "reconnecting";

export interface SelectedCell {
    column: string;
    value: unknown;
}

/** The result of opening a connection and loading its schema. */
interface EstablishResult {
    conn: RemoteDatabase;
    tables: TableInfo[];
    schemaObjects: SchemaObject[];
    schemaMap: Record<string, string[]>;
}

export interface State {
    wsUrl: string;
    db: RemoteDatabase | null;
    status: ConnStatus;
    connectError: string | null;
    recentUrls: string[];

    tables: TableInfo[];
    selectedTable: string | null;
    selectedTableSchema: ColumnInfo[];

    activeTab: Tab;

    schemaObjects: SchemaObject[];
    schemaLoading: boolean;
    schemaError: string | null;
    structureColumns: Record<string, ColumnInfo[]>;
    schemaMap: Record<string, string[]>;

    selectedCell: SelectedCell | null;

    pageSize: number;
    pageOffset: number;
    searchTerm: string;
    rows: Record<string, unknown>[];
    totalRows: number;
    rowsLoading: boolean;
    rowsError: string | null;

    querySql: string;
    queryResult: Record<string, unknown>[] | null;
    queryColumns: string[];
    queryError: string | null;
    queryLoading: boolean;
    explainResult: ExplainNode[] | null;
    explainError: string | null;
}

function initialState(): State {
    return {
        wsUrl: localStorage.getItem(LAST_URL_KEY) ?? "ws://localhost:8090/sql",
        db: null,
        status: "idle",
        connectError: null,
        recentUrls: JSON.parse(localStorage.getItem(RECENT_URLS_KEY) ?? "[]"),

        tables: [],
        selectedTable: null,
        selectedTableSchema: [],

        activeTab: "structure",

        schemaObjects: [],
        schemaLoading: false,
        schemaError: null,
        structureColumns: {},
        schemaMap: {},

        selectedCell: null,

        pageSize: 50,
        pageOffset: 0,
        searchTerm: "",
        rows: [],
        totalRows: 0,
        rowsLoading: false,
        rowsError: null,

        querySql: "SELECT * FROM sqlite_master;",
        queryResult: null,
        queryColumns: [],
        queryError: null,
        queryLoading: false,
        explainResult: null,
        explainError: null,
    };
}

function rememberUrl(url: string) {
    const recent: string[] = JSON.parse(localStorage.getItem(RECENT_URLS_KEY) ?? "[]");
    const next = [url, ...recent.filter((u) => u !== url)].slice(0, 10);
    localStorage.setItem(RECENT_URLS_KEY, JSON.stringify(next));
    localStorage.setItem(LAST_URL_KEY, url);
    return next;
}

function resetTableState(state: State) {
    state.selectedTable = null;
    state.selectedTableSchema = [];
    state.pageOffset = 0;
    state.searchTerm = "";
    state.rows = [];
    state.totalRows = 0;
    state.rowsError = null;
    state.selectedCell = null;
}

const store = createStore({
    state: initialState,
    actions: {
        setWsUrl(state: State, url: string) {
            state.wsUrl = url;
        },

        // Connection transitions are split into synchronous actions (rather than one async
        // action) because global-store only emits a draft once, after an async action fully
        // resolves — so "connecting"/"reconnecting" states would never render mid-flight.
        // The async orchestration lives in the plain connectTo/disconnect functions below.
        beginConnect(state: State, url: string) {
            state.status = "connecting";
            state.connectError = null;
            state.wsUrl = url;
        },

        connectSucceeded(state: State, payload: EstablishResult & { recentUrls: string[] }) {
            state.db = payload.conn;
            state.tables = payload.tables;
            state.schemaObjects = payload.schemaObjects;
            state.schemaMap = payload.schemaMap;
            state.recentUrls = payload.recentUrls;
            state.structureColumns = {};
            state.schemaError = null;
            state.connectError = null;
            resetTableState(state);
            state.activeTab = "structure";
            state.status = "connected";
        },

        connectFailed(state: State, err: string) {
            state.db = null;
            state.status = "idle";
            state.connectError = err;
        },

        beginReconnect(state: State) {
            // Drop the dead handle so any interaction during reconnect no-ops instead of
            // erroring; the stale rows/schema stay on screen until we reconnect.
            state.db = null;
            state.status = "reconnecting";
            state.connectError = null;
        },

        reconnectSucceeded(state: State, payload: EstablishResult) {
            state.db = payload.conn;
            state.tables = payload.tables;
            state.schemaObjects = payload.schemaObjects;
            state.schemaMap = payload.schemaMap;
            state.structureColumns = {};
            state.connectError = null;
            state.status = "connected";
        },

        finalizeDisconnect(state: State) {
            state.db?.close();
            state.db = null;
            state.status = "idle";
            state.connectError = null;
            state.tables = [];
            state.schemaObjects = [];
            state.structureColumns = {};
            state.schemaMap = {};
            resetTableState(state);
        },

        async loadSchema(state: State) {
            const conn = state.db;
            if (!conn) return;
            state.schemaLoading = true;
            state.schemaError = null;
            try {
                state.schemaObjects = await listSchemaObjects(conn);
            } catch (err) {
                state.schemaError = String(err);
            } finally {
                state.schemaLoading = false;
            }
        },

        async toggleStructureColumns(state: State, name: string) {
            if (state.structureColumns[name]) {
                delete state.structureColumns[name];
                return;
            }
            const conn = state.db;
            if (!conn) return;
            try {
                state.structureColumns[name] = await getTableSchema(conn, name);
            } catch {
                state.structureColumns[name] = [];
            }
        },

        async loadTable(state: State, name: string) {
            state.selectedTable = name;
            state.pageOffset = 0;
            state.searchTerm = "";
            state.selectedTableSchema = [];
            state.selectedCell = null;
            state.activeTab = "browse";

            const conn = state.db;
            if (!conn) return;
            try {
                state.selectedTableSchema = await getTableSchema(conn, name);
            } catch (err) {
                state.rowsError = String(err);
            }

            await runRefreshTableRows(state);
        },

        async refreshTableRows(state: State) {
            state.selectedCell = null;
            await runRefreshTableRows(state);
        },

        setActiveTab(state: State, tab: Tab) {
            state.activeTab = tab;
        },

        setSearchTerm(state: State, term: string) {
            state.searchTerm = term;
            state.pageOffset = 0;
        },

        setPageOffset(state: State, offset: number) {
            state.pageOffset = Math.max(0, offset);
        },

        selectCell(state: State, column: string, value: unknown) {
            state.selectedCell = { column, value };
        },

        clearSelectedCell(state: State) {
            state.selectedCell = null;
        },

        setQuerySql(state: State, sql: string) {
            state.querySql = sql;
        },

        async executeQuery(state: State) {
            const conn = state.db;
            if (!conn) return;
            state.queryLoading = true;
            state.queryError = null;
            state.explainResult = null;
            state.explainError = null;
            state.selectedCell = null;
            try {
                const result = await runQuery(conn, state.querySql);
                state.queryResult = result;
                state.queryColumns = result.length ? Object.keys(result[0]) : [];
            } catch (err) {
                state.queryError = String(err);
                state.queryResult = null;
            } finally {
                state.queryLoading = false;
            }
        },

        async explainQuery(state: State) {
            const conn = state.db;
            if (!conn) return;
            state.queryLoading = true;
            state.explainError = null;
            state.queryError = null;
            try {
                state.explainResult = await explainQueryPlan(conn, state.querySql);
            } catch (err) {
                state.explainError = String(err);
                state.explainResult = null;
            } finally {
                state.queryLoading = false;
            }
        },
    },
});

// Shared by loadTable/refreshTableRows actions above. Takes the in-flight draft directly
// rather than going through store.set, since it's only ever called from within another action.
async function runRefreshTableRows(state: State) {
    const conn = state.db;
    const table = state.selectedTable;
    if (!conn || !table) return;

    state.rowsLoading = true;
    state.rowsError = null;
    try {
        const columns = state.selectedTableSchema.map((c) => c.name);
        const opts = { limit: state.pageSize, offset: state.pageOffset };
        const term = state.searchTerm;
        const [newRows, count] = await Promise.all([
            searchTableRows(conn, table, columns, term, opts),
            searchTableRowCount(conn, table, columns, term),
        ]);
        state.rows = newRows;
        state.totalRows = count;
    } catch (err) {
        state.rowsError = String(err);
    } finally {
        state.rowsLoading = false;
    }
}

// --- Connection lifecycle + automatic reconnection ---------------------------------------
//
// A liveness heartbeat (`SELECT 1`) polls the connection; if it fails we transition to
// "reconnecting" and retry with exponential backoff until the server comes back (e.g. after
// a redeploy). A generation counter invalidates any in-flight/scheduled work the moment the
// user connects elsewhere or disconnects, so stale async results can't resurrect a session.

const HEARTBEAT_MS = 8000;
const HEARTBEAT_TIMEOUT_MS = 5000;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;

let connGen = 0;
let currentUrl: string | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Timed out")), ms);
        promise.then(
            (v) => {
                clearTimeout(timer);
                resolve(v);
            },
            (e) => {
                clearTimeout(timer);
                reject(e);
            },
        );
    });
}

async function establish(url: string): Promise<EstablishResult> {
    const conn = await connect(url);
    const [tables, schemaObjects, schemaMap] = await Promise.all([
        listTables(conn),
        listSchemaObjects(conn),
        getSchemaMap(conn),
    ]);
    return { conn, tables, schemaObjects, schemaMap };
}

function clearTimers() {
    if (heartbeatTimer !== null) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
    if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
}

function startHeartbeat(gen: number) {
    if (heartbeatTimer !== null) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => void heartbeat(gen), HEARTBEAT_MS);
}

async function heartbeat(gen: number) {
    if (gen !== connGen) return;
    const db = store.get().db;
    if (!db) return;
    try {
        await withTimeout(db.run("SELECT 1"), HEARTBEAT_TIMEOUT_MS);
    } catch {
        if (gen === connGen) onConnectionLost(gen);
    }
}

function onConnectionLost(gen: number) {
    if (gen !== connGen) return;
    if (heartbeatTimer !== null) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
    try {
        store.get().db?.close();
    } catch { /* already gone */ }
    reconnectAttempt = 0;
    store.actions.beginReconnect();
    scheduleReconnect(gen, 0);
}

function scheduleReconnect(gen: number, delay: number) {
    if (reconnectTimer !== null) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => void attemptReconnect(gen), delay);
}

async function attemptReconnect(gen: number) {
    if (gen !== connGen || currentUrl === null) return;
    try {
        const result = await establish(currentUrl);
        if (gen !== connGen) {
            result.conn.close();
            return;
        }
        reconnectAttempt = 0;
        store.actions.reconnectSucceeded(result);
        startHeartbeat(gen);
        if (store.get().selectedTable) void store.actions.refreshTableRows();
    } catch {
        if (gen !== connGen) return;
        reconnectAttempt += 1;
        const delay = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.min(reconnectAttempt - 1, 5));
        scheduleReconnect(gen, delay);
    }
}

export async function connectTo(url: string) {
    const gen = ++connGen;
    clearTimers();
    reconnectAttempt = 0;
    currentUrl = url;
    store.actions.beginConnect(url);
    try {
        const result = await establish(url);
        if (gen !== connGen) {
            result.conn.close();
            return;
        }
        store.actions.connectSucceeded({ ...result, recentUrls: rememberUrl(url) });
        startHeartbeat(gen);
    } catch (err) {
        if (gen !== connGen) return;
        currentUrl = null;
        store.actions.connectFailed(String(err));
    }
}

export function disconnect() {
    connGen += 1; // invalidate any in-flight connect / scheduled reconnect
    clearTimers();
    reconnectAttempt = 0;
    currentUrl = null;
    store.actions.finalizeDisconnect();
}

export const useStore = createUseStore(store);

export const {
    setWsUrl,
    loadSchema,
    toggleStructureColumns,
    loadTable,
    refreshTableRows,
    setActiveTab,
    setSearchTerm,
    setPageOffset,
    selectCell,
    clearSelectedCell,
    setQuerySql,
    executeQuery,
    explainQuery,
} = store.actions;

export const selectConnected = (s: State) => s.status === "connected";
export const selectHasSession = (s: State) => s.status === "connected" || s.status === "reconnecting";
