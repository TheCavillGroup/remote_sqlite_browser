import { createStore, createUseStore } from "@tangerie/global-store";
import { RemoteDatabase } from "@tangerie/remote-sqlite/client";
import {
    type ColumnInfo,
    connect,
    type ExplainNode,
    explainQueryPlan,
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

export interface SelectedCell {
    column: string;
    value: unknown;
}

export interface State {
    wsUrl: string;
    db: RemoteDatabase | null;
    connecting: boolean;
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
        connecting: false,
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

        async connectTo(state: State, url: string) {
            state.connecting = true;
            state.connectError = null;
            try {
                const conn = await connect(url);
                state.db = conn;
                state.recentUrls = rememberUrl(url);
                const [tables, schema] = await Promise.all([
                    listTables(conn),
                    listSchemaObjects(conn),
                ]);
                state.tables = tables;
                state.schemaObjects = schema;
                state.structureColumns = {};
                state.schemaError = null;
                resetTableState(state);
                state.activeTab = "structure";
            } catch (err) {
                state.db = null;
                state.connectError = String(err);
            } finally {
                state.connecting = false;
            }
        },

        disconnect(state: State) {
            state.db?.close();
            state.db = null;
            state.tables = [];
            state.schemaObjects = [];
            state.structureColumns = {};
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

export const useStore = createUseStore(store);

export const {
    setWsUrl,
    connectTo,
    disconnect,
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

export const selectConnected = (s: State) => s.db !== null;
