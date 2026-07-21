import { connectTo, disconnect, setWsUrl, useStore } from "../state/store.ts";

function Spinner() {
    return (
        <svg class="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
    );
}

export function ConnectionBar() {
    const status = useStore((s) => s.status);
    const wsUrl = useStore((s) => s.wsUrl);
    const connectError = useStore((s) => s.connectError);
    const recentUrls = useStore((s) => s.recentUrls);

    const active = status === "connected" || status === "reconnecting";

    function onSubmit(e: SubmitEvent) {
        e.preventDefault();
        if (active) {
            disconnect();
        } else if (status === "idle" && wsUrl.trim() !== "") {
            connectTo(wsUrl.trim());
        }
    }

    const buttonColor = status === "reconnecting"
        ? "bg-amber-500 hover:bg-amber-600"
        : active
        ? "bg-red-600 hover:bg-red-700"
        : "bg-blue-600 hover:bg-blue-700";

    const buttonLabel = status === "connecting"
        ? "Connecting…"
        : status === "reconnecting"
        ? "Reconnecting…"
        : status === "connected"
        ? "Disconnect"
        : "Connect";

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
                disabled={status !== "idle"}
                placeholder="ws://localhost:8090/sql"
                class="min-w-64 flex-1 rounded border border-gray-300 px-2 py-1 text-sm font-mono disabled:bg-gray-100 disabled:text-gray-500"
            />
            <datalist id="recent-urls">
                {recentUrls.map((u) => <option key={u} value={u} />)}
            </datalist>
            <button
                type="submit"
                disabled={status === "connecting"}
                title={status === "reconnecting" ? "Stop reconnecting" : undefined}
                class={`inline-flex items-center gap-1.5 rounded px-3 py-1 text-sm font-medium text-white disabled:opacity-60 ${buttonColor}`}
            >
                {(status === "connecting" || status === "reconnecting") && <Spinner />}
                {buttonLabel}
            </button>
            {status === "connected" && <span class="text-sm text-green-700">● Connected</span>}
            {connectError && (
                <span class="rounded border border-red-300 bg-red-50 px-2 py-1 text-sm text-red-700">
                    {connectError}
                </span>
            )}
        </form>
    );
}
