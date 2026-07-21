import { connectTo, disconnect, selectConnected, setWsUrl, useStore } from "../state/store.ts";

export function ConnectionBar() {
    const isConnected = useStore(selectConnected);
    const isConnecting = useStore((s) => s.connecting);
    const wsUrl = useStore((s) => s.wsUrl);
    const connectError = useStore((s) => s.connectError);
    const recentUrls = useStore((s) => s.recentUrls);

    function onSubmit(e: SubmitEvent) {
        e.preventDefault();
        if (isConnected) {
            disconnect();
        } else if (wsUrl.trim() !== "") {
            connectTo(wsUrl.trim());
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
                value={wsUrl}
                onInput={(e) => setWsUrl((e.target as HTMLInputElement).value)}
                disabled={isConnected}
                placeholder="ws://localhost:8090/sql"
                class="min-w-64 flex-1 rounded border border-gray-300 px-2 py-1 text-sm font-mono disabled:bg-gray-100 disabled:text-gray-500"
            />
            <datalist id="recent-urls">
                {recentUrls.map((u) => <option key={u} value={u} />)}
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
            {connectError && (
                <span class="rounded border border-red-300 bg-red-50 px-2 py-1 text-sm text-red-700">
                    {connectError}
                </span>
            )}
        </form>
    );
}
