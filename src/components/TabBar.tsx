import { setActiveTab, type Tab, useStore } from "../state/store.ts";

const TABS: { id: Tab; label: string }[] = [
    { id: "structure", label: "Database Structure" },
    { id: "browse", label: "Browse Data" },
    { id: "query", label: "Execute SQL" },
];

export function TabBar() {
    const activeTab = useStore((s) => s.activeTab);

    return (
        <nav class="flex gap-1 border-b border-gray-200 bg-gray-50 px-2">
            {TABS.map((t) => (
                <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTab(t.id)}
                    class={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                        activeTab === t.id
                            ? "border-blue-600 text-blue-700"
                            : "border-transparent text-gray-600 hover:text-gray-900"
                    }`}
                >
                    {t.label}
                </button>
            ))}
        </nav>
    );
}
