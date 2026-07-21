import { runQuery } from "../modules/db.ts";
import * as store from "../state/store.ts";
import { ResultsTable } from "./ResultsTable.tsx";

export function QueryRunner() {
    async function run() {
        const conn = store.db.value;
        if (!conn) return;
        store.queryLoading.value = true;
        store.queryError.value = null;
        try {
            const result = await runQuery(conn, store.querySql.value);
            store.queryResult.value = result;
            store.queryColumns.value = result.length ? Object.keys(result[0]) : [];
        } catch (err) {
            store.queryError.value = String(err);
            store.queryResult.value = null;
        } finally {
            store.queryLoading.value = false;
        }
    }

    function onKeyDown(e: KeyboardEvent) {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            run();
        }
    }

    return (
        <div class="flex h-full flex-col p-3">
            <textarea
                value={store.querySql.value}
                onInput={(e) => (store.querySql.value = (e.target as HTMLTextAreaElement).value)}
                onKeyDown={onKeyDown}
                rows={6}
                spellcheck={false}
                class="w-full rounded border border-gray-300 p-2 font-mono text-sm"
                placeholder="SELECT * FROM my_table;"
            />
            <div class="mt-2 flex items-center gap-2">
                <button
                    type="button"
                    onClick={run}
                    disabled={store.queryLoading.value}
                    class="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                    {store.queryLoading.value ? "Running…" : "Run"}
                </button>
                <span class="text-xs text-gray-400">Ctrl/Cmd+Enter to run</span>
            </div>
            {store.queryError.value && (
                <div class="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {store.queryError.value}
                </div>
            )}
            <div class="mt-3 flex-1 overflow-auto rounded border border-gray-200">
                {store.queryResult.value !== null && (
                    <ResultsTable columns={store.queryColumns.value} rows={store.queryResult.value} />
                )}
            </div>
        </div>
    );
}
