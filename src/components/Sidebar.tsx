import { loadTable, useStore } from "../state/store.ts";

export function Sidebar() {
    const tables = useStore((s) => s.tables);
    const selectedTable = useStore((s) => s.selectedTable);

    return (
        <aside class="flex max-h-48 w-full shrink-0 flex-col border-b border-gray-200 bg-gray-50 md:max-h-none md:w-64 md:border-b-0 md:border-r">
            <div class="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Tables
            </div>
            <ul class="flex-1 overflow-y-auto">
                {tables.map((t) => (
                    <li key={t.name}>
                        <button
                            type="button"
                            onClick={() => loadTable(t.name)}
                            class={`w-full truncate px-3 py-1.5 text-left text-sm ${
                                selectedTable === t.name
                                    ? "bg-blue-50 text-blue-700"
                                    : "text-gray-700 hover:bg-gray-100"
                            }`}
                            title={t.name}
                        >
                            {t.name}
                            {t.type === "view" && <span class="ml-1 text-xs text-gray-400">(view)</span>}
                        </button>
                    </li>
                ))}
                {tables.length === 0 && (
                    <li class="px-3 py-2 text-sm text-gray-400">No tables found.</li>
                )}
            </ul>
        </aside>
    );
}
