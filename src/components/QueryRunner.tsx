import { useState } from "preact/hooks";
import type { ExplainNode } from "../modules/db.ts";
import { executeQuery, explainQuery, generateTypes, setQuerySql, useStore } from "../state/store.ts";
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

function ExplainTree({ nodes, parent = 0, depth = 0 }: {
    nodes: ExplainNode[];
    parent?: number;
    depth?: number;
}) {
    const children = nodes.filter((n) => n.parent === parent);
    if (children.length === 0) return null;
    return (
        <ul class={depth > 0 ? "ml-3 space-y-0.5 border-l border-gray-200 pl-3" : "space-y-0.5"}>
            {children.map((n) => (
                <li key={n.id}>
                    <PlanRow detail={n.detail} />
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
    const generatedCode = useStore((s) => s.generatedCode);
    const generateError = useStore((s) => s.generateError);
    const schemaMap = useStore((s) => s.schemaMap);

    return (
        <div class="flex flex-col p-3 md:h-full">
            <SqlEditor
                value={querySql}
                onChange={setQuerySql}
                onRun={() => executeQuery()}
                schema={schemaMap}
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
                <button
                    type="button"
                    onClick={() => generateTypes()}
                    disabled={queryLoading}
                    class="rounded border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                >
                    Generate TS
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
                        : <ExplainTree nodes={explainResult} />}
                </div>
            )}
            {generatedCode === null && explainResult === null && queryResult !== null && (
                <div class="mt-3 rounded border border-gray-200 md:min-h-0 md:flex-1 md:overflow-auto">
                    <ResultsTable columns={queryColumns} rows={queryResult} />
                </div>
            )}
        </div>
    );
}
