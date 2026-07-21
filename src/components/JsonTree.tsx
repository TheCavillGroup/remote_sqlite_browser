import { useState } from "preact/hooks";

interface Props {
    value: unknown;
    /** Property/index label for this node when rendered as a child. */
    label?: string;
    /** Auto-expand nodes at or below this depth. */
    depth?: number;
}

function isContainer(v: unknown): v is Record<string, unknown> | unknown[] {
    return v !== null && typeof v === "object";
}

function primitiveClass(v: unknown): string {
    if (v === null) return "text-gray-400";
    switch (typeof v) {
        case "number":
        case "bigint":
            return "text-blue-600";
        case "boolean":
            return "text-amber-600";
        case "string":
            return "text-green-700";
        default:
            return "text-gray-800";
    }
}

function formatPrimitive(v: unknown): string {
    if (v === null) return "null";
    if (typeof v === "string") return JSON.stringify(v);
    return String(v);
}

export function JsonTree({ value, label, depth = 0 }: Props) {
    const [open, setOpen] = useState(depth < 2);

    if (!isContainer(value)) {
        return (
            <div class="font-mono text-xs leading-5">
                {label !== undefined && <span class="text-purple-700">{label}: </span>}
                <span class={primitiveClass(value)}>{formatPrimitive(value)}</span>
            </div>
        );
    }

    const isArray = Array.isArray(value);
    const entries: [string, unknown][] = isArray
        ? (value as unknown[]).map((v, i) => [String(i), v])
        : Object.entries(value as Record<string, unknown>);
    const summary = isArray ? `[${entries.length}]` : `{${entries.length}}`;

    return (
        <div class="font-mono text-xs leading-5">
            <button
                type="button"
                onClick={() => setOpen(!open)}
                class="text-left hover:bg-gray-100"
            >
                <span class="inline-block w-3 text-gray-400">{open ? "▾" : "▸"}</span>
                {label !== undefined && <span class="text-purple-700">{label}: </span>}
                <span class="text-gray-400">{summary}</span>
            </button>
            {open && (
                <div class="ml-4 border-l border-gray-200 pl-2">
                    {entries.map(([k, v]) => (
                        <JsonTree key={k} label={k} value={v} depth={depth + 1} />
                    ))}
                </div>
            )}
        </div>
    );
}
