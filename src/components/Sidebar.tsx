import * as store from "../state/store.ts";

export function Sidebar() {
    return (
        <aside class="flex w-64 shrink-0 flex-col border-r border-gray-200 bg-gray-50">
            <button
                type="button"
                onClick={() => (store.activeTab.value = "query")}
                class={`border-b border-gray-200 px-3 py-2 text-left text-sm font-medium ${
                    store.activeTab.value === "query"
                        ? "bg-blue-50 text-blue-700"
                        : "text-gray-700 hover:bg-gray-100"
                }`}
            >
                ▶ Run SQL
            </button>
            <div class="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Tables
            </div>
            <ul class="flex-1 overflow-y-auto">
                {store.tables.value.map((t) => (
                    <li key={t.name}>
                        <button
                            type="button"
                            onClick={() => store.loadTable(t.name)}
                            class={`w-full truncate px-3 py-1.5 text-left text-sm ${
                                store.activeTab.value === "browse" && store.selectedTable.value === t.name
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
                {store.tables.value.length === 0 && (
                    <li class="px-3 py-2 text-sm text-gray-400">No tables found.</li>
                )}
            </ul>
        </aside>
    );
}
