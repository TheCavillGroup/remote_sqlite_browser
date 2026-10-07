import { useState } from "preact/hooks";
import type { ColumnInfo, SchemaObject } from "../modules/db.ts";
import { toggleStructureColumns, useStore } from "../state/store.ts";

const SECTIONS : { type: SchemaObject["type"], title: string }[] = [
    { type: "table", title: "Tables" },
    { type: "view", title: "Views" },
    { type: "index", title: "Indexes" },
    { type: "trigger", title: "Triggers" }
];

function ColumnChips({ columns } : Record<"columns", ColumnInfo[]>) {
    if(columns.length === 0) return <span class="text-xs text-gray-400">No columns.</span>

    return <div class="flex flex-wrap gap-1">
        {
            columns.map(x => <span key={x.name} class="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-600">
                {x.name}
                <span class="text-gray-400">:{x.type || "any"}</span>
                {x.pk ? <span class="text-amber-600"> pk</span> : null}
                { x.hidden === 2 && <span class="text-purple-600"> virtual</span> }
                { x.hidden === 3 && <span class="text-purple-600"> stored</span> }
            </span>)
        }
    </div>
}

function TableRow({ obj } : Record<"obj", SchemaObject>) {
    const columns = useStore(s => s.structureColumns[obj.name]);
    const open = columns !== undefined;

    return <li class="border-b border-gray-100">
        <button
            type="button"
            onClick={() => toggleStructureColumns(obj.name)}
            class="flex w-full items-center gap-1 px-3 py-1.5 text-left text-sm hover:bg-gray-50"
        >
            <span class="inline-block w-3 text-gray-400">{open ? "▾" : "▸"}</span>
            <span class="font-mono text-gray-800">{obj.name}</span>
        </button>
        {
            open && <div class="px-3 pb-2 pl-7">
                <ColumnChips columns={columns}/>
                {
                    obj.sql && <pre class="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded bg-gray-50 p-2 font-mono text-xs text-gray-600">
                        {obj.sql}
                    </pre>
                }
            </div>
        }
    </li>
}

function SqlRow({ obj } : Record<"obj", SchemaObject>) {
    const [open, setOpen] = useState(false);

    return <li class="border-b border-gray-100">
        <button
            type="button"
            onClick={() => setOpen(!open)}
            class="flex w-full items-center gap-1 px-3 py-1.5 text-left text-sm hover:bg-gray-50"
        >
            <span class="inline-block w-3 text-gray-400">{open ? "▾" : "▸"}</span>
            <span class="font-mono text-gray-800">{obj.name}</span>
            <span class="ml-1 text-xs text-gray-400">on {obj.tbl_name}</span>
        </button>
        {
            open && <div class="px-3 pb-2 pl-7">
                {
                    obj.sql ? <pre class="overflow-x-auto whitespace-pre-wrap break-words rounded bg-gray-50 p-2 font-mono text-xs text-gray-600">
                        {obj.sql}
                    </pre> : <span class="text-xs text-gray-400">Automatically created (no SQL).</span>
                }
            </div>
        }
    </li>
}

export default function StructureView() {
    const schemaObjects = useStore(s => s.schemaObjects);
    const loading = useStore(s => s.schemaLoading);
    const error = useStore(s => s.schemaError);

    if(loading) return <p class="p-4 text-sm text-gray-400">Loading schema…</p>
    if(error) return <div class="m-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
        {error}
    </div>

    return <div class="md:h-full md:overflow-auto">
        {
            SECTIONS.map(({ type, title }) => {
                const objects = schemaObjects.filter(x => x.type === type);
                return <section key={type}>
                    <h2 class="sticky top-0 bg-gray-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        {title} ({objects.length})
                    </h2>
                    <ul>
                        {
                            objects.map(x => type === "table" || type === "view" ? <TableRow key={x.name} obj={x}/> : <SqlRow key={x.name} obj={x}/>)
                        }
                        { objects.length === 0 && <li class="px-3 py-1.5 text-sm text-gray-400">None.</li> }
                    </ul>
                </section>
            })
        }
    </div>
}
