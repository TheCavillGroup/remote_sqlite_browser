import { useEffect, useRef } from "preact/hooks";
import { refreshTableRows, setPageOffset, setSearchTerm, useStore } from "../state/store.ts";
import ResultsTable from "./ResultsTable.tsx";

export default function TableBrowser() {
    const table = useStore(s => s.selectedTable);
    const schema = useStore(s => s.selectedTableSchema);
    const offset = useStore(s => s.pageOffset);
    const size = useStore(s => s.pageSize);
    const total = useStore(s => s.totalRows);
    const searchTerm = useStore(s => s.searchTerm);
    const rowsLoading = useStore(s => s.rowsLoading);
    const rowsError = useStore(s => s.rowsError);
    const rows = useStore(s => s.rows);

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if(debounceRef.current) clearTimeout(debounceRef.current);
        }
    }, []);

    if(!table) return <p class="p-4 text-sm text-gray-400">Select a table from the sidebar.</p>

    const from = total === 0 ? 0 : offset + 1;
    const to = Math.min(offset + size, total);

    return <div class="flex flex-col md:h-full">
        <div class="border-b border-gray-200 p-3">
            <h2 class="mb-2 font-mono text-sm font-semibold text-gray-800">{table}</h2>
            {
                schema.length > 0 && <div class="mb-2 flex flex-wrap gap-1">
                    {
                        schema.map(x => <span key={x.name} class="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-600">
                            {x.name}
                            <span class="text-gray-400">:{x.type || "any"}</span>
                            {x.pk ? <span class="text-amber-600"> pk</span> : null}
                            { x.hidden === 2 && <span class="text-purple-600"> virtual</span> }
                            { x.hidden === 3 && <span class="text-purple-600"> stored</span> }
                        </span>)
                    }
                </div>
            }
            <div class="flex flex-wrap items-center gap-2">
                <input
                    type="text"
                    value={searchTerm}
                    onInput={e => {
                        setSearchTerm((e.target as HTMLInputElement).value);
                        if(debounceRef.current) clearTimeout(debounceRef.current);
                        debounceRef.current = setTimeout(() => refreshTableRows(), 300);
                    }}
                    placeholder="Search rows…"
                    class="w-64 rounded border border-gray-300 px-2 py-1 text-sm"
                />
                <span class="text-sm text-gray-500">
                    {rowsLoading ? "Loading…" : `Showing ${from}–${to} of ${total}`}
                </span>
                <div class="ml-auto flex gap-1">
                    <button
                        type="button"
                        onClick={() => {
                            setPageOffset(Math.max(0, offset - size));
                            refreshTableRows();
                        }}
                        disabled={offset === 0}
                        class="rounded border border-gray-300 px-2 py-1 text-sm disabled:opacity-40"
                    >
                        Prev
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setPageOffset(offset + size);
                            refreshTableRows();
                        }}
                        disabled={offset + size >= total}
                        class="rounded border border-gray-300 px-2 py-1 text-sm disabled:opacity-40"
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>
        {
            rowsError && <div class="m-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                {rowsError}
            </div>
        }
        <div class="md:min-h-0 md:flex-1 md:overflow-auto">
            <ResultsTable columns={schema.map(x => x.name)} rows={rows}/>
        </div>
    </div>
}
