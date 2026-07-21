import { clearSelectedCell, useStore } from "../state/store.ts";
import { JsonTree } from "./JsonTree.tsx";

/** Parse a value as JSON only if it yields an object/array — plain scalars stay raw text. */
function tryParseJson(value: unknown): unknown | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return undefined;
    try {
        const parsed = JSON.parse(trimmed);
        return parsed !== null && typeof parsed === "object" ? parsed : undefined;
    } catch {
        return undefined;
    }
}

function rawText(value: unknown): string {
    if (value === null || value === undefined) return "NULL";
    if (value instanceof Uint8Array) return `<blob ${value.length} bytes>`;
    if (typeof value === "object") return JSON.stringify(value, null, 2);
    return String(value);
}

export function CellInspector() {
    const cell = useStore((s) => s.selectedCell);
    if (!cell) return null;

    const json = tryParseJson(cell.value);

    return (
        <aside class="flex w-96 shrink-0 flex-col border-l border-gray-200 bg-white">
            <div class="flex items-center justify-between border-b border-gray-200 px-3 py-2">
                <span class="truncate font-mono text-sm font-semibold text-gray-800" title={cell.column}>
                    {cell.column}
                </span>
                <button
                    type="button"
                    onClick={() => clearSelectedCell()}
                    class="ml-2 rounded px-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    title="Close"
                >
                    ✕
                </button>
            </div>
            <div class="flex-1 overflow-auto p-3">
                {json !== undefined
                    ? <JsonTree value={json} />
                    : (
                        <pre class="whitespace-pre-wrap break-words font-mono text-xs text-gray-800">
                            {rawText(cell.value)}
                        </pre>
                    )}
            </div>
        </aside>
    );
}
