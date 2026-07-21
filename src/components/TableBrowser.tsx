import { useEffect, useRef } from "preact/hooks";
import * as store from "../state/store.ts";
import { ResultsTable } from "./ResultsTable.tsx";

export function TableBrowser() {
    const table = store.selectedTable.value;
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    function onSearchInput(value: string) {
        store.searchTerm.value = value;
        store.pageOffset.value = 0;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => store.refreshTableRows(), 300);
    }

    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    if (!table) {
        return <p class="p-4 text-sm text-gray-400">Select a table from the sidebar.</p>;
    }

    const offset = store.pageOffset.value;
    const size = store.pageSize.value;
    const total = store.totalRows.value;
    const from = total === 0 ? 0 : offset + 1;
    const to = Math.min(offset + size, total);

    function goPrev() {
        store.pageOffset.value = Math.max(0, offset - size);
        store.refreshTableRows();
    }

    function goNext() {
        store.pageOffset.value = offset + size;
        store.refreshTableRows();
    }

    return (
        <div class="flex h-full flex-col">
            <div class="border-b border-gray-200 p-3">
                <h2 class="mb-2 font-mono text-sm font-semibold text-gray-800">{table}</h2>
                {store.selectedTableSchema.value.length > 0 && (
                    <div class="mb-2 flex flex-wrap gap-1">
                        {store.selectedTableSchema.value.map((c) => (
                            <span
                                key={c.name}
                                class="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-600"
                            >
                                {c.name}
                                <span class="text-gray-400">:{c.type || "any"}</span>
                                {c.pk ? <span class="text-amber-600"> pk</span> : null}
                            </span>
                        ))}
                    </div>
                )}
                <div class="flex flex-wrap items-center gap-2">
                    <input
                        type="text"
                        value={store.searchTerm.value}
                        onInput={(e) => onSearchInput((e.target as HTMLInputElement).value)}
                        placeholder="Search rows…"
                        class="w-64 rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                    <span class="text-sm text-gray-500">
                        {store.rowsLoading.value ? "Loading…" : `Showing ${from}–${to} of ${total}`}
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
            {store.rowsError.value && (
                <div class="m-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {store.rowsError.value}
                </div>
            )}
            <div class="flex-1 overflow-auto">
                <ResultsTable
                    columns={store.selectedTableSchema.value.map((c) => c.name)}
                    rows={store.rows.value}
                />
            </div>
        </div>
    );
}
