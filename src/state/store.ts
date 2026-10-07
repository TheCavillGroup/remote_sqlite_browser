import { createStore, createUseStore } from "@tangerie/global-store";
import { RemoteDatabase } from "@tangerie/remote-sqlite/client";
import {
    type ColumnInfo,
    connect,
    type ExplainNode,
    explainQueryPlan,
    getSchemaMap,
    getTableSchema,
    hasLimitClause,
    listSchemaObjects,
    listTables,
    MAX_QUERY_ROWS,
    runQuery,
    sampleRowsForTypes,
    type SchemaObject,
    searchTableRowCount,
    searchTableRows,
    type TableInfo
} from "../modules/db.ts";
import { generateRunSnippet } from "../modules/tsgen.ts";

const LAST_URL_KEY = "remote-sqlite:last-url";
const RECENT_URLS_KEY = "remote-sqlite:recent-urls";
const QUERY_TABS_KEY_PREFIX = "remote-sqlite:queries:";

const HEARTBEAT_MS = 8000;
const HEARTBEAT_TIMEOUT_MS = 5000;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;

const TABS = ["structure", "browse", "query"] as const;
export type Tab = (typeof TABS)[number];

const CONN_STATUSES = ["idle", "connecting", "connected", "reconnecting"] as const;
export type ConnStatus = (typeof CONN_STATUSES)[number];

export interface SelectedCell {
    column: string;
    value: unknown;
}

export interface QueryTabState {
    id: string;
    title: string;
    querySql: string;
    queryResult: Record<string, unknown>[] | null;
    queryColumns: string[];
    queryTruncated: boolean;
    queryError: string | null;
    queryLoading: boolean;
    explainResult: ExplainNode[] | null;
    explainError: string | null;
    generatedCode: string | null;
    generateError: string | null;
}

type EstablishResult = Awaited<ReturnType<typeof establish>>;

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

    queryTabs: QueryTabState[];
    activeQueryTabId: string;
}

let queryTabIdSeq = 1;

let connGen = 0;
let currentUrl : string | null = null;
let heartbeatTimer : ReturnType<typeof setInterval> | null = null;
let reconnectTimer : ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let rowsSeq = 0;

// Lowest free "Query <n>" so closing a tab frees its number
function nextQueryTabNumber(tabs : QueryTabState[]) : number {
    const used = new Set<number>();
    for(const t of tabs) {
        const m = /^Query (\d+)$/.exec(t.title);
        if(m) used.add(Number(m[1]));
    }
    let n = 1;
    while(used.has(n)) n++;
    return n;
}

function makeQueryTab(sql = "", existingTabs : QueryTabState[] = []) : QueryTabState {
    return {
        id: `q${queryTabIdSeq++}`,
        title: `Query ${nextQueryTabNumber(existingTabs)}`,
        querySql: sql,
        queryResult: null,
        queryColumns: [],
        queryTruncated: false,
        queryError: null,
        queryLoading: false,
        explainResult: null,
        explainError: null,
        generatedCode: null,
        generateError: null
    };
}

const findQueryTab = (state : State, id : string) => state.queryTabs.find(x => x.id === id);

function loadQueryTabs(url : string) : QueryTabState[] {
    try {
        const raw = localStorage.getItem(QUERY_TABS_KEY_PREFIX + url);
        const saved : Record<"title" | "sql", string>[] = raw ? JSON.parse(raw) : [];
        if(!Array.isArray(saved) || saved.length === 0) return [makeQueryTab("SELECT * FROM sqlite_master;")];
        return saved.map(x => {
            const tab = makeQueryTab(x.sql);
            tab.title = x.title;
            return tab;
        });
    } catch {
        return [makeQueryTab("SELECT * FROM sqlite_master;")];
    }
}

function saveQueryTabs(url : string, tabs : QueryTabState[]) {
    const payload : Record<"title" | "sql", string>[] = tabs.map(x => ({ title: x.title, sql: x.querySql }));
    localStorage.setItem(QUERY_TABS_KEY_PREFIX + url, JSON.stringify(payload));
}

function initialState() : State {
    const firstQueryTab = makeQueryTab("SELECT * FROM sqlite_master;");
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

        queryTabs: [firstQueryTab],
        activeQueryTabId: firstQueryTab.id
    };
}

function rememberUrl(url : string) {
    const recent : string[] = JSON.parse(localStorage.getItem(RECENT_URLS_KEY) ?? "[]");
    const next = [url, ...recent.filter(x => x !== url)].slice(0, 10);
    localStorage.setItem(RECENT_URLS_KEY, JSON.stringify(next));
    localStorage.setItem(LAST_URL_KEY, url);
    return next;
}

function resetTableState(state : State) {
    state.selectedTable = null;
    state.selectedTableSchema = [];
    state.pageOffset = 0;
    state.searchTerm = "";
    state.rows = [];
    state.totalRows = 0;
    state.rowsError = null;
    // An in-flight load from the old session gets dropped, so nothing else would clear these
    state.rowsLoading = false;
    state.schemaLoading = false;
    state.selectedCell = null;
}

const store = createStore({
    state: initialState,
    actions: {
        setWsUrl(state : State, url : string) {
            state.wsUrl = url;
        },

        // These are sync on purpose - global-store only emits after an async action resolves,
        // so "connecting"/"reconnecting" would never render. connectTo/disconnect do the async part
        beginConnect(state : State, url : string) {
            state.status = "connecting";
            state.connectError = null;
            state.wsUrl = url;
        },

        connectSucceeded(state : State, payload : EstablishResult & { recentUrls: string[], queryTabs: QueryTabState[] }) {
            state.db = payload.conn;
            state.tables = payload.tables;
            state.schemaObjects = payload.schemaObjects;
            state.schemaMap = payload.schemaMap;
            state.recentUrls = payload.recentUrls;
            state.structureColumns = {};
            state.schemaError = null;
            state.connectError = null;
            resetTableState(state);
            state.queryTabs = payload.queryTabs;
            state.activeQueryTabId = payload.queryTabs[0].id;
            state.activeTab = "structure";
            state.status = "connected";
        },

        connectFailed(state : State, err : string) {
            state.db = null;
            state.status = "idle";
            state.connectError = err;
        },

        beginReconnect(state : State) {
            // Null db so interactions no-op while reconnecting, stale rows stay on screen
            state.db = null;
            state.status = "reconnecting";
            state.connectError = null;
        },

        reconnectSucceeded(state : State, payload : EstablishResult) {
            state.db = payload.conn;
            state.tables = payload.tables;
            state.schemaObjects = payload.schemaObjects;
            state.schemaMap = payload.schemaMap;
            state.structureColumns = {};
            state.connectError = null;
            state.status = "connected";
        },

        finalizeDisconnect(state : State) {
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

        // No async actions - their draft is taken before the await and committed after,
        // reverting anything that happened in between (typed SQL, queryLoading). loadTable etc do the async part
        beginLoadSchema(state : State) {
            state.schemaLoading = true;
            state.schemaError = null;
        },

        schemaSucceeded(state : State, objects : SchemaObject[]) {
            state.schemaObjects = objects;
            state.schemaLoading = false;
        },

        schemaFailed(state : State, err : string) {
            state.schemaError = err;
            state.schemaLoading = false;
        },

        collapseStructureColumns(state : State, name : string) {
            delete state.structureColumns[name];
        },

        structureColumnsLoaded(state : State, name : string, columns : ColumnInfo[]) {
            state.structureColumns[name] = columns;
        },

        beginLoadTable(state : State, name : string) {
            state.selectedTable = name;
            state.pageOffset = 0;
            state.searchTerm = "";
            state.selectedTableSchema = [];
            state.selectedCell = null;
            state.activeTab = "browse";
        },

        tableSchemaSucceeded(state : State, columns : ColumnInfo[]) {
            state.selectedTableSchema = columns;
        },

        beginRows(state : State) {
            state.selectedCell = null;
            state.rowsLoading = true;
            state.rowsError = null;
        },

        rowsSucceeded(state : State, rows : Record<string, unknown>[], count : number) {
            state.rows = rows;
            state.totalRows = count;
            state.rowsLoading = false;
        },

        rowsFailed(state : State, err : string) {
            state.rowsError = err;
            state.rowsLoading = false;
        },

        setActiveTab(state : State, tab : Tab) {
            state.activeTab = tab;
        },

        setSearchTerm(state : State, term : string) {
            state.searchTerm = term;
            state.pageOffset = 0;
        },

        setPageOffset(state : State, offset : number) {
            state.pageOffset = Math.max(0, offset);
        },

        selectCell(state : State, column : string, value : unknown) {
            state.selectedCell = { column, value };
        },

        clearSelectedCell(state : State) {
            state.selectedCell = null;
        },

        setQuerySql(state : State, id : string, sql : string) {
            const tab = findQueryTab(state, id);
            if(tab) tab.querySql = sql;
        },

        addQueryTab(state : State) {
            const tab = makeQueryTab("", state.queryTabs);
            state.queryTabs.push(tab);
            state.activeQueryTabId = tab.id;
        },

        renameQueryTab(state : State, id : string, title : string) {
            const tab = findQueryTab(state, id);
            if(!tab) return;
            tab.title = title.trim() || `Query ${nextQueryTabNumber(state.queryTabs.filter(x => x.id !== id))}`;
        },

        closeQueryTab(state : State, id : string) {
            if(state.queryTabs.length <= 1) return;
            const idx = state.queryTabs.findIndex(x => x.id === id);
            if(idx === -1) return;
            state.queryTabs.splice(idx, 1);
            if(state.activeQueryTabId === id) state.activeQueryTabId = (state.queryTabs[idx] ?? state.queryTabs[idx - 1]).id;
        },

        setActiveQueryTab(state : State, id : string) {
            state.activeQueryTabId = id;
        },

        // Sync for the same reason as the connection ones - an async draft is committed after the await,
        // so "Running…" never renders and anything typed mid-query gets reverted
        beginRun(state : State, id : string) {
            const tab = findQueryTab(state, id);
            if(!tab) return;
            tab.queryLoading = true;
            tab.queryError = null;
            tab.explainResult = null;
            tab.explainError = null;
            tab.generatedCode = null;
            tab.generateError = null;
            state.selectedCell = null;
        },

        runSucceeded(state : State, id : string, payload : { rows: Record<string, unknown>[], columns: string[], truncated: boolean }) {
            const tab = findQueryTab(state, id);
            if(!tab) return;
            tab.queryResult = payload.rows;
            tab.queryColumns = payload.columns;
            tab.queryTruncated = payload.truncated;
            tab.queryLoading = false;
        },

        runFailed(state : State, id : string, err : string) {
            const tab = findQueryTab(state, id);
            if(!tab) return;
            tab.queryError = err;
            tab.queryResult = null;
            tab.queryTruncated = false;
            tab.queryLoading = false;
        },

        explainSucceeded(state : State, id : string, nodes : ExplainNode[]) {
            const tab = findQueryTab(state, id);
            if(!tab) return;
            tab.explainResult = nodes;
            tab.queryLoading = false;
        },

        explainFailed(state : State, id : string, err : string) {
            const tab = findQueryTab(state, id);
            if(!tab) return;
            tab.explainError = err;
            tab.explainResult = null;
            tab.queryLoading = false;
        },

        generateSucceeded(state : State, id : string, code : string) {
            const tab = findQueryTab(state, id);
            if(!tab) return;
            tab.generatedCode = code;
            tab.queryLoading = false;
        },

        generateFailed(state : State, id : string, err : string) {
            const tab = findQueryTab(state, id);
            if(!tab) return;
            tab.generateError = err;
            tab.generatedCode = null;
            tab.queryLoading = false;
        },

        // Session changed mid-run, still have to clear the flag or the buttons stay disabled
        queryAborted(state : State, id : string) {
            const tab = findQueryTab(state, id);
            if(tab) tab.queryLoading = false;
        }
    }
});

export async function loadSchema() {
    const conn = store.get().db;
    if(!conn) return;
    store.actions.beginLoadSchema();
    try {
        const objects = await listSchemaObjects(conn);
        if(store.get().db !== conn) return;
        store.actions.schemaSucceeded(objects);
    } catch(err) {
        if(store.get().db !== conn) return;
        store.actions.schemaFailed(String(err));
    }
}

export async function toggleStructureColumns(name : string) {
    const { db: conn, structureColumns } = store.get();
    if(structureColumns[name]) return store.actions.collapseStructureColumns(name);
    if(!conn) return;
    const columns = await getTableSchema(conn, name).catch(() => []);
    if(store.get().db !== conn) return;
    store.actions.structureColumnsLoaded(name, columns);
}

export async function loadTable(name : string) {
    store.actions.beginLoadTable(name);
    const conn = store.get().db;
    if(!conn) return;
    try {
        const columns = await getTableSchema(conn, name);
        if(store.get().db !== conn || store.get().selectedTable !== name) return;
        store.actions.tableSchemaSucceeded(columns);
    } catch(err) {
        if(store.get().db !== conn || store.get().selectedTable !== name) return;
        store.actions.rowsFailed(String(err));
    }

    await refreshTableRows();
}

// Only the latest request commits, so a slow page/search can't land over a newer one
export async function refreshTableRows() {
    const { db: conn, selectedTable: table, selectedTableSchema, pageSize, pageOffset, searchTerm } = store.get();
    if(!conn || !table) return;

    const seq = ++rowsSeq;
    store.actions.beginRows();
    try {
        const columns = selectedTableSchema.map(x => x.name);
        const opts = { limit: pageSize, offset: pageOffset };
        const [newRows, count] = await Promise.all([
            searchTableRows(conn, table, columns, searchTerm, opts),
            searchTableRowCount(conn, table, columns, searchTerm)
        ]);
        if(seq !== rowsSeq || store.get().db !== conn) return;
        store.actions.rowsSucceeded(newRows, count);
    } catch(err) {
        if(seq !== rowsSeq || store.get().db !== conn) return;
        store.actions.rowsFailed(String(err));
    }
}

function withTimeout<T>(prom : Promise<T>, ms : number) : Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Timed out")), ms);
        prom.then(v => {
            clearTimeout(timer);
            resolve(v);
        }, err => {
            clearTimeout(timer);
            reject(err);
        });
    });
}

async function establish(url : string) {
    const conn = await connect(url);
    const [tables, schemaObjects, schemaMap] = await Promise.all([
        listTables(conn),
        listSchemaObjects(conn),
        getSchemaMap(conn)
    ]);
    return { conn, tables, schemaObjects, schemaMap };
}

function clearTimers() {
    if(heartbeatTimer !== null) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
    if(reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
}

function startHeartbeat(gen : number) {
    if(heartbeatTimer !== null) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => heartbeat(gen), HEARTBEAT_MS);
}

// connGen bumps on every connect/disconnect so stale timers and results can't resurrect an old session
async function heartbeat(gen : number) {
    if(gen !== connGen) return;
    const db = store.get().db;
    if(!db) return;
    try {
        await withTimeout(db.run("SELECT 1"), HEARTBEAT_TIMEOUT_MS);
    } catch {
        if(gen === connGen) onConnectionLost(gen);
    }
}

function onConnectionLost(gen : number) {
    if(gen !== connGen) return;
    if(heartbeatTimer !== null) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
    try {
        store.get().db?.close();
    } catch {
        // Already gone
    }
    reconnectAttempt = 0;
    store.actions.beginReconnect();
    scheduleReconnect(gen, 0);
}

function scheduleReconnect(gen : number, delay : number) {
    if(reconnectTimer !== null) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => attemptReconnect(gen), delay);
}

async function attemptReconnect(gen : number) {
    if(gen !== connGen || currentUrl == null) return;
    try {
        const r = await establish(currentUrl);
        if(gen !== connGen) {
            r.conn.close();
            return;
        }
        reconnectAttempt = 0;
        store.actions.reconnectSucceeded(r);
        startHeartbeat(gen);
        if(store.get().selectedTable) refreshTableRows();
    } catch {
        if(gen !== connGen) return;
        reconnectAttempt += 1;
        scheduleReconnect(gen, Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.min(reconnectAttempt - 1, 5)));
    }
}

export async function connectTo(url : string) {
    const gen = ++connGen;
    clearTimers();
    reconnectAttempt = 0;
    currentUrl = url;
    store.actions.beginConnect(url);
    try {
        const r = await establish(url);
        if(gen !== connGen) {
            r.conn.close();
            return;
        }
        store.actions.connectSucceeded({ ...r, recentUrls: rememberUrl(url), queryTabs: loadQueryTabs(url) });
        startHeartbeat(gen);
    } catch(err) {
        if(gen !== connGen) return;
        currentUrl = null;
        store.actions.connectFailed(String(err));
    }
}

export function disconnect() {
    connGen += 1;
    clearTimers();
    reconnectAttempt = 0;
    currentUrl = null;
    store.actions.finalizeDisconnect();
}

// These re-check db before committing so a run that outlives its session is dropped
export async function executeQuery(tabId : string) {
    const { db: conn, queryTabs, wsUrl } = store.get();
    const tab = queryTabs.find(x => x.id === tabId);
    if(!conn || !tab || tab.queryLoading) return;
    const querySql = tab.querySql;
    saveQueryTabs(wsUrl, queryTabs);
    store.actions.beginRun(tabId);
    try {
        const rows = await runQuery(conn, querySql);
        if(store.get().db !== conn) {
            store.actions.queryAborted(tabId);
            return;
        }
        // Own LIMIT means it ran uncapped
        const truncated = !hasLimitClause(querySql) && rows.length > MAX_QUERY_ROWS;
        const page = truncated ? rows.slice(0, MAX_QUERY_ROWS) : rows;
        store.actions.runSucceeded(tabId, {
            rows: page,
            columns: page.length ? Object.keys(page[0]) : [],
            truncated
        });
    } catch(err) {
        if(store.get().db !== conn) {
            store.actions.queryAborted(tabId);
            return;
        }
        store.actions.runFailed(tabId, String(err));
    }
}

export async function explainQuery(tabId : string) {
    const { db: conn, queryTabs } = store.get();
    const tab = queryTabs.find(x => x.id === tabId);
    if(!conn || !tab || tab.queryLoading) return;
    const querySql = tab.querySql;
    store.actions.beginRun(tabId);
    try {
        const nodes = await explainQueryPlan(conn, querySql);
        if(store.get().db !== conn) {
            store.actions.queryAborted(tabId);
            return;
        }
        store.actions.explainSucceeded(tabId, nodes);
    } catch(err) {
        if(store.get().db !== conn) {
            store.actions.queryAborted(tabId);
            return;
        }
        store.actions.explainFailed(tabId, String(err));
    }
}

export async function generateTypes(tabId : string) {
    const { db: conn, queryTabs } = store.get();
    const tab = queryTabs.find(x => x.id === tabId);
    if(!conn || !tab || tab.queryLoading) return;
    const querySql = tab.querySql;
    store.actions.beginRun(tabId);
    try {
        const rows = await sampleRowsForTypes(conn, querySql);
        if(store.get().db !== conn) {
            store.actions.queryAborted(tabId);
            return;
        }
        store.actions.generateSucceeded(tabId, generateRunSnippet(querySql, rows));
    } catch(err) {
        if(store.get().db !== conn) {
            store.actions.queryAborted(tabId);
            return;
        }
        store.actions.generateFailed(tabId, String(err));
    }
}

export const useStore = createUseStore(store);

export const {
    setWsUrl,
    setActiveTab,
    setSearchTerm,
    setPageOffset,
    selectCell,
    clearSelectedCell,
    setQuerySql,
    addQueryTab,
    renameQueryTab,
    closeQueryTab,
    setActiveQueryTab
} = store.actions;

export const selectConnected = (state : State) => state.status === "connected";
export const selectHasSession = (state : State) => state.status === "connected" || state.status === "reconnecting";
export const selectActiveQueryTab = (state : State) => state.queryTabs.find(x => x.id === state.activeQueryTabId);
