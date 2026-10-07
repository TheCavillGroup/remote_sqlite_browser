import { useState } from "preact/hooks";

// Depth stops auto-expanding at 2 but breadth doesn't, a 200k element array would mount 200k nodes
const MAX_ENTRIES = 200;

interface Props {
    value: unknown;
    label?: string;
    /** Auto-expand below this depth */
    depth?: number;
}

function primitiveClass(v : unknown) : string {
    if(v === null) return "text-gray-400";
    const t = typeof v;
    if(t === "number" || t === "bigint") return "text-blue-600";
    else if(t === "boolean") return "text-amber-600";
    else if(t === "string") return "text-green-700";
    return "text-gray-800";
}

function formatPrimitive(v : unknown) : string {
    if(v === null) return "null";
    if(typeof v === "string") return JSON.stringify(v);
    return String(v);
}

export default function JsonTree({ value, label, depth = 0 } : Props) {
    const [open, setOpen] = useState(depth < 2);
    const [shown, setShown] = useState(MAX_ENTRIES);

    if(value === null || typeof value !== "object") return <div class="font-mono text-xs leading-5">
        { label !== undefined && <span class="text-purple-700">{label}: </span> }
        <span class={primitiveClass(value)}>{formatPrimitive(value)}</span>
    </div>

    const isArray = Array.isArray(value);
    const entries : [string, unknown][] = isArray ? (value as unknown[]).map((v, i) => [String(i), v]) : Object.entries(value as Record<string, unknown>);
    const summary = isArray ? `[${entries.length}]` : `{${entries.length}}`;

    return <div class="font-mono text-xs leading-5">
        <button
            type="button"
            onClick={() => setOpen(!open)}
            class="text-left hover:bg-gray-100"
        >
            <span class="inline-block w-3 text-gray-400">{open ? "▾" : "▸"}</span>
            { label !== undefined && <span class="text-purple-700">{label}: </span> }
            <span class="text-gray-400">{summary}</span>
        </button>
        {
            open && <div class="ml-4 border-l border-gray-200 pl-2">
                {
                    entries.slice(0, shown).map(([k, v]) => <JsonTree key={k} label={k} value={v} depth={depth + 1}/>)
                }
                {
                    entries.length > shown && <button
                        type="button"
                        onClick={() => setShown(shown + MAX_ENTRIES)}
                        class="text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    >
                        … {entries.length - shown} more
                    </button>
                }
            </div>
        }
    </div>
}
