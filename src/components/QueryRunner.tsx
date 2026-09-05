import { useRef, useState } from "preact/hooks";
import { type ExplainNode, MAX_QUERY_ROWS } from "../modules/db.ts";
import {
    addQueryTab,
    closeQueryTab,
    executeQuery,
    explainQuery,
    generateTypes,
    renameQueryTab,
    selectActiveQueryTab,
    setActiveQueryTab,
    setQuerySql,
    useStore,
} from "../state/store.ts";
import { ResultsTable } from "./ResultsTable.tsx";
import { SqlEditor } from "./SqlEditor.tsx";

function GeneratedCode({ code }: { code: string }) {
    const [copied, setCopied] = useState(false);

    function copy() {
        navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        }, () => {/* clipboard blocked — ignore */});
    }

    return (
        <div class="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
            <div class="flex items-center justify-between border-b border-gray-200 px-3 py-2">
                <span class="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    TypeScript
                </span>
                <button
                    type="button"
                    onClick={copy}
                    class="rounded border border-gray-300 bg-white px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
                >
                    {copied ? "Copied!" : "Copy"}
                </button>
            </div>
            <pre class="overflow-x-auto p-3 font-mono text-xs leading-5 text-gray-800">{code}</pre>
            <p class="border-t border-gray-200 px-3 py-1.5 text-[11px] text-gray-400">
                Types inferred from up to 100 sampled rows — nullability is best-effort.
            </p>
        </div>
    );
}

function opStyle(op: string): string {
    switch (op) {
        case "SEARCH":
            return "bg-blue-100 text-blue-700";
        case "SCAN":
            return "bg-sky-100 text-sky-700";
        case "USE":
            return "bg-purple-100 text-purple-700";
        default:
            return "bg-gray-200 text-gray-600";
    }
}

/** Turn an EXPLAIN QUERY PLAN detail line into a badge + target + index/scan chips. */
function PlanRow({ detail }: { detail: string }) {
    const op = detail.split(/\s+/)[0];
    const structured = op === "SEARCH" || op === "SCAN";
    const usingIdx = detail.match(/USING (COVERING )?INDEX (\S+)/);
    const usingPk = /USING INTEGER PRIMARY KEY/.test(detail);
    const fullScan = op === "SCAN" && !usingIdx && !usingPk;
    const constraint = detail.match(/\(([^)]*)\)\s*$/)?.[1] ?? null;
    const rest = detail.slice(op.length).trim();

    let target: string | null = null;
    if (structured) {
        const after = rest;
        const cut = after.search(/\s+USING\b|\s*\(/);
        target = (cut === -1 ? after : after.slice(0, cut)).replace(/^TABLE\s+/i, "").trim() || null;
    }

    return (
        <div
            title={detail}
            class="flex flex-wrap items-center gap-1.5 rounded px-1.5 py-1 hover:bg-white"
        >
            <span
                class={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${opStyle(op)}`}
            >
                {op}
            </span>
            {structured
                ? (
                    <>
                        {target && (
                            <span class="font-mono text-xs font-semibold text-gray-800">{target}</span>
                        )}
                        {usingIdx && (
                            <span class="rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-[11px] text-emerald-700">
                                {usingIdx[1] ? "covering index " : "index "}
                                {usingIdx[2]}
                            </span>
                        )}
                        {usingPk && (
                            <span class="rounded bg-indigo-50 px-1.5 py-0.5 font-mono text-[11px] text-indigo-700">
                                primary key
                            </span>
                        )}
                        {fullScan && (
                            <span class="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                                full scan
                            </span>
                        )}
                        {constraint && (
                            <span class="font-mono text-[11px] text-gray-400">({constraint})</span>
                        )}
                    </>
                )
                : <span class="text-xs text-gray-600">{rest}</span>}
        </div>
    );
}

/** Guards against a malformed plan (a self-parented or cyclic id) recursing forever. */
const MAX_PLAN_DEPTH = 64;

function byParent(nodes: ExplainNode[]): Map<number, ExplainNode[]> {
    const map = new Map<number, ExplainNode[]>();
    for (const n of nodes) {
        const siblings = map.get(n.parent);
        if (siblings) siblings.push(n);
        else map.set(n.parent, [n]);
    }
    return map;
}

function ExplainTree({ tree, parent = 0, depth = 0 }: {
    tree: Map<number, ExplainNode[]>;
    parent?: number;
    depth?: number;
}) {
    const nodes = tree.get(parent);
    if (!nodes || depth > MAX_PLAN_DEPTH) return null;
    return (
        <ul class={depth > 0 ? "ml-3 space-y-0.5 border-l border-gray-200 pl-3" : "space-y-0.5"}>
            {nodes.map((n) => (
                <li key={n.id}>
                    <PlanRow detail={n.detail} />
                    <ExplainTree tree={tree} parent={n.id} depth={depth + 1} />
                </li>
            ))}
        </ul>
    );
}

// Tabs shown as their own strip, mirroring TabBar, so the toolbar below is unambiguously scoped
// to whichever tab is active.
function QueryTabStrip() {
    const tabs = useStore((s) => s.queryTabs);
    const activeId = useStore((s) => s.activeQueryTabId);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [draft, setDraft] = useState("");
    const cancelledRef = useRef(false);

    function startRename(id: string, title: string) {
        cancelledRef.current = false;
        setDraft(title);
        setRenamingId(id);
    }

    function commitRename() {
        if (cancelledRef.current) {
            cancelledRef.current = false;
            setRenamingId(null);
            return;
        }
        if (renamingId) renameQueryTab(renamingId, draft);
        setRenamingId(null);
    }

    function cancelRename() {
        cancelledRef.current = true;
        setRenamingId(null);
    }

    return (
        <div class="flex items-center gap-1 overflow-x-auto border-b border-gray-200">
            {tabs.map((t) => (
                <div
                    key={t.id}
                    class={`group -mb-px flex shrink-0 items-center gap-1 border-b-2 py-1.5 pl-3 pr-1.5 text-sm ${
                        t.id === activeId
                            ? "border-blue-600 text-blue-700"
                            : "border-transparent text-gray-600 hover:text-gray-900"
                    }`}
                >
                    {renamingId === t.id
                        ? (
                            <input
                                type="text"
                                value={draft}
                                autoFocus
                                onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
                                onFocus={(e) => (e.target as HTMLInputElement).select()}
                                onBlur={commitRename}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
                                    if (e.key === "Escape") cancelRename();
                                }}
                                class="w-28 max-w-40 rounded border border-blue-400 px-1 py-0.5 text-sm font-medium text-gray-900"
                            />
                        )
                        : (
                            <button
                                type="button"
                                onClick={() => setActiveQueryTab(t.id)}
                                class="max-w-40 truncate font-medium"
                            >
                                {t.title}
                            </button>
                        )}
                    {renamingId !== t.id && (
                        <button
                            type="button"
                            onClick={() => startRename(t.id, t.title)}
                            title="Rename tab"
                            class="hidden rounded px-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700 group-hover:inline"
                        >
                            ✎
                        </button>
                    )}
                    {tabs.length > 1 && renamingId !== t.id && (
                        <button
                            type="button"
                            onClick={() => closeQueryTab(t.id)}
                            title="Close tab"
                            class="rounded px-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                        >
                            ×
                        </button>
                    )}
                </div>
            ))}
            <button
                type="button"
                onClick={() => addQueryTab()}
                title="New query tab"
                class="shrink-0 px-2 py-1.5 text-sm text-gray-500 hover:text-gray-900"
            >
                +
            </button>
        </div>
    );
}

// The editor lives in its own component so that typing — which writes querySql on every keystroke —
// re-renders only this subtree. Selecting querySql in QueryRunner instead would re-render the whole
// results table on every character, which locks the tab up on any sizeable result.
function QueryEditorPanel({ tabId }: { tabId: string }) {
    const querySql = useStore((s) => s.queryTabs.find((t) => t.id === tabId)?.querySql ?? "");
    const queryLoading = useStore((s) => s.queryTabs.find((t) => t.id === tabId)?.queryLoading ?? false);
    const schemaMap = useStore((s) => s.schemaMap);

    return (
        <>
            <SqlEditor
                value={querySql}
                onChange={(sql) => setQuerySql(tabId, sql)}
                onRun={() => executeQuery(tabId)}
                schema={schemaMap}
            />
            <div class="mt-2 flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => executeQuery(tabId)}
                    disabled={queryLoading}
                    class="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                    {queryLoading ? "Running…" : "Run"}
                </button>
                <button
                    type="button"
                    onClick={() => explainQuery(tabId)}
                    disabled={queryLoading}
                    class="rounded border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                >
                    Explain
                </button>
                <button
                    type="button"
                    onClick={() => generateTypes(tabId)}
                    disabled={queryLoading}
                    class="rounded border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                >
                    Generate TS
                </button>
                <span class="text-xs text-gray-400">Ctrl/Cmd+Enter to run</span>
            </div>
        </>
    );
}

export function QueryRunner() {
    const activeQueryTabId = useStore((s) => s.activeQueryTabId);
    const queryError = useStore((s) => selectActiveQueryTab(s)?.queryError ?? null);
    const queryResult = useStore((s) => selectActiveQueryTab(s)?.queryResult ?? null);
    const queryColumns = useStore((s) => selectActiveQueryTab(s)?.queryColumns ?? []);
    const queryTruncated = useStore((s) => selectActiveQueryTab(s)?.queryTruncated ?? false);
    const explainResult = useStore((s) => selectActiveQueryTab(s)?.explainResult ?? null);
    const explainError = useStore((s) => selectActiveQueryTab(s)?.explainError ?? null);
    const generatedCode = useStore((s) => selectActiveQueryTab(s)?.generatedCode ?? null);
    const generateError = useStore((s) => selectActiveQueryTab(s)?.generateError ?? null);

    return (
        <div class="flex flex-col p-3 md:h-full">
            <QueryTabStrip />
            <div class="mt-3">
                <QueryEditorPanel key={activeQueryTabId} tabId={activeQueryTabId} />
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
            {generateError && (
                <div class="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {generateError}
                </div>
            )}
            {generatedCode !== null && <GeneratedCode code={generatedCode} />}
            {generatedCode === null && explainResult !== null && (
                <div class="mt-3 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <div class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Query Plan
                    </div>
                    {explainResult.length === 0
                        ? <p class="text-xs text-gray-400">No plan returned.</p>
                        : <ExplainTree tree={byParent(explainResult)} />}
                </div>
            )}
            {generatedCode === null && explainResult === null && queryResult !== null && (
                <>
                    {queryTruncated && (
                        <p class="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                            Showing the first {MAX_QUERY_ROWS.toLocaleString()} rows. Add your own LIMIT to see more.
                        </p>
                    )}
                    <div class="mt-3 rounded border border-gray-200 md:min-h-0 md:flex-1 md:overflow-auto">
                        <ResultsTable columns={queryColumns} rows={queryResult} />
                    </div>
                </>
            )}
        </div>
    );
}
