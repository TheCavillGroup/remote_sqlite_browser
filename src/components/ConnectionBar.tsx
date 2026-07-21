import * as store from "../state/store.ts";

export function ConnectionBar() {
    const isConnected = store.connected.value;
    const isConnecting = store.connecting.value;

    function onSubmit(e: SubmitEvent) {
        e.preventDefault();
        if (isConnected) {
            store.disconnect();
        } else if (store.wsUrl.value.trim() !== "") {
            store.connectTo(store.wsUrl.value.trim());
        }
    }

    return (
        <form
            onSubmit={onSubmit}
            class="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-4 py-2"
        >
            <span class="text-sm font-semibold text-gray-800">Remote SQLite Viewer</span>
            <input
                type="text"
                list="recent-urls"
                value={store.wsUrl.value}
                onInput={(e) => (store.wsUrl.value = (e.target as HTMLInputElement).value)}
                disabled={isConnected}
                placeholder="ws://localhost:8090/sql"
                class="min-w-64 flex-1 rounded border border-gray-300 px-2 py-1 text-sm font-mono disabled:bg-gray-100 disabled:text-gray-500"
            />
            <datalist id="recent-urls">
                {store.recentUrls.value.map((u) => <option key={u} value={u} />)}
            </datalist>
            <button
                type="submit"
                disabled={isConnecting}
                class={`rounded px-3 py-1 text-sm font-medium text-white disabled:opacity-50 ${
                    isConnected ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
                }`}
            >
                {isConnecting ? "Connecting…" : isConnected ? "Disconnect" : "Connect"}
            </button>
            {isConnected && <span class="text-sm text-green-700">● Connected</span>}
            {store.connectError.value && (
                <span class="rounded border border-red-300 bg-red-50 px-2 py-1 text-sm text-red-700">
                    {store.connectError.value}
                </span>
            )}
        </form>
    );
}
