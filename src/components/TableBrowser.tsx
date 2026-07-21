import { useEffect, useRef } from "preact/hooks";
import { refreshTableRows, setPageOffset, setSearchTerm, useStore } from "../state/store.ts";
import { ResultsTable } from "./ResultsTable.tsx";

export function TableBrowser() {
    const table = useStore((s) => s.selectedTable);
    const schema = useStore((s) => s.selectedTableSchema);
    const offset = useStore((s) => s.pageOffset);
    const size = useStore((s) => s.pageSize);
    const total = useStore((s) => s.totalRows);
    const searchTerm = useStore((s) => s.searchTerm);
    const rowsLoading = useStore((s) => s.rowsLoading);
    const rowsError = useStore((s) => s.rowsError);
    const rows = useStore((s) => s.rows);

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    function onSearchInput(value: string) {
        setSearchTerm(value);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => refreshTableRows(), 300);
    }

    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    if (!table) {
        return <p class="p-4 text-sm text-gray-400">Select a table from the sidebar.</p>;
    }

    const from = total === 0 ? 0 : offset + 1;
    const to = Math.min(offset + size, total);

    function goPrev() {
        setPageOffset(Math.max(0, offset - size));
        refreshTableRows();
    }

    function goNext() {
        setPageOffset(offset + size);
        refreshTableRows();
    }

    return (
        <div class="flex flex-col md:h-full">
            <div class="border-b border-gray-200 p-3">
                <h2 class="mb-2 font-mono text-sm font-semibold text-gray-800">{table}</h2>
                {schema.length > 0 && (
                    <div class="mb-2 flex flex-wrap gap-1">
                        {schema.map((c) => (
                            <span
                                key={c.name}
                                class="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-600"
                            >
                                {c.name}
                                <span class="text-gray-400">:{c.type || "any"}</span>
                                {c.pk ? <span class="text-amber-600"> pk</span> : null}
                                {c.hidden === 2 && <span class="text-purple-600"> virtual</span>}
                                {c.hidden === 3 && <span class="text-purple-600"> stored</span>}
                            </span>
                        ))}
                    </div>
                )}
                <div class="flex flex-wrap items-center gap-2">
                    <input
                        type="text"
                        value={searchTerm}
                        onInput={(e) => onSearchInput((e.target as HTMLInputElement).value)}
                        placeholder="Search rows…"
                        class="w-64 rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                    <span class="text-sm text-gray-500">
                        {rowsLoading ? "Loading…" : `Showing ${from}–${to} of ${total}`}
                    </span>
                    <div class="ml-auto flex gap-1">
                        <button
                            type="button"
                            onClick={goPrev}
                            disabled={offset === 0}
                            class="rounded border border-gray-300 px-2 py-1 text-sm disabled:opacity-40"
                        >
                            Prev
                        </button>
                        <button
                            type="button"
                            onClick={goNext}
                            disabled={offset + size >= total}
                            class="rounded border border-gray-300 px-2 py-1 text-sm disabled:opacity-40"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>
            {rowsError && (
                <div class="m-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {rowsError}
                </div>
            )}
            <div class="md:min-h-0 md:flex-1 md:overflow-auto">
                <ResultsTable
                    columns={schema.map((c) => c.name)}
                    rows={rows}
                />
            </div>
        </div>
    );
}
