import type { ExplainNode } from "../modules/db.ts";
import { executeQuery, explainQuery, setQuerySql, useStore } from "../state/store.ts";
import { ResultsTable } from "./ResultsTable.tsx";

function ExplainTree({ nodes, parent = 0, depth = 0 }: {
    nodes: ExplainNode[];
    parent?: number;
    depth?: number;
}) {
    const children = nodes.filter((n) => n.parent === parent);
    if (children.length === 0) return null;
    return (
        <ul class={depth > 0 ? "ml-4 border-l border-gray-200 pl-3" : ""}>
            {children.map((n) => (
                <li key={n.id} class="py-0.5 font-mono text-xs text-gray-800">
                    <span class="text-gray-400">↳ </span>
                    {n.detail}
                    <ExplainTree nodes={nodes} parent={n.id} depth={depth + 1} />
                </li>
            ))}
        </ul>
    );
}

export function QueryRunner() {
    const querySql = useStore((s) => s.querySql);
    const queryLoading = useStore((s) => s.queryLoading);
    const queryError = useStore((s) => s.queryError);
    const queryResult = useStore((s) => s.queryResult);
    const queryColumns = useStore((s) => s.queryColumns);
    const explainResult = useStore((s) => s.explainResult);
    const explainError = useStore((s) => s.explainError);

    function onKeyDown(e: KeyboardEvent) {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            executeQuery();
        }
    }

    return (
        <div class="flex h-full flex-col p-3">
            <textarea
                value={querySql}
                onInput={(e) => setQuerySql((e.target as HTMLTextAreaElement).value)}
                onKeyDown={onKeyDown}
                rows={6}
                spellcheck={false}
                class="w-full rounded border border-gray-300 p-2 font-mono text-sm"
                placeholder="SELECT * FROM my_table;"
            />
            <div class="mt-2 flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => executeQuery()}
                    disabled={queryLoading}
                    class="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                    {queryLoading ? "Running…" : "Run"}
                </button>
                <button
                    type="button"
                    onClick={() => explainQuery()}
                    disabled={queryLoading}
                    class="rounded border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                >
                    Explain
                </button>
                <span class="text-xs text-gray-400">Ctrl/Cmd+Enter to run</span>
            </div>
            {queryError && (
                <div class="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {queryError}
                </div>
            )}
            {explainError && (
                <div class="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {explainError}
                </div>
            )}
            {explainResult !== null && (
                <div class="mt-3 overflow-auto rounded border border-gray-200 p-3">
                    <div class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Query Plan
                    </div>
                    {explainResult.length === 0
                        ? <p class="text-xs text-gray-400">No plan returned.</p>
                        : <ExplainTree nodes={explainResult} />}
                </div>
            )}
            {explainResult === null && queryResult !== null && (
                <div class="mt-3 flex-1 overflow-auto rounded border border-gray-200">
                    <ResultsTable columns={queryColumns} rows={queryResult} />
                </div>
            )}
        </div>
    );
}
