import { useEffect, useRef, useState } from "preact/hooks";
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
    const editable = status === "idle";

    const [menuOpen, setMenuOpen] = useState(false);
    const fieldRef = useRef<HTMLDivElement | null>(null);

    // Close the recent-connections menu on any click outside it.
    useEffect(() => {
        if (!menuOpen) return;
        function onDocMouseDown(e: MouseEvent) {
            if (fieldRef.current && !fieldRef.current.contains(e.target as Node)) {
                setMenuOpen(false);
            }
        }
        document.addEventListener("mousedown", onDocMouseDown);
        return () => document.removeEventListener("mousedown", onDocMouseDown);
    }, [menuOpen]);

    function onSubmit(e: SubmitEvent) {
        e.preventDefault();
        if (active) {
            disconnect();
        } else if (editable && wsUrl.trim() !== "") {
            connectTo(wsUrl.trim());
        }
    }

    function pickRecent(url: string) {
        setMenuOpen(false);
        connectTo(url);
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

    const showRecentToggle = editable && recentUrls.length > 0;

    return (
        <form
            onSubmit={onSubmit}
            class="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-4 py-2"
        >
            <span class="text-sm font-semibold text-gray-800">Remote SQLite Viewer</span>
            <div ref={fieldRef} class="relative flex min-w-64 flex-1 items-center">
                <input
                    type="text"
                    value={wsUrl}
                    onInput={(e) => setWsUrl((e.target as HTMLInputElement).value)}
                    disabled={!editable}
                    placeholder="ws://localhost:8090/sql"
                    class={`w-full rounded border border-gray-300 py-1 pl-2 text-sm font-mono disabled:bg-gray-100 disabled:text-gray-500 ${
                        showRecentToggle ? "pr-8" : "pr-2"
                    }`}
                />
                {showRecentToggle && (
                    <button
                        type="button"
                        onClick={() => setMenuOpen((o) => !o)}
                        title="Recent connections"
                        aria-label="Recent connections"
                        class="absolute right-1 flex h-6 w-6 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                    >
                        <svg
                            class={`h-4 w-4 transition-transform ${menuOpen ? "rotate-180" : ""}`}
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            aria-hidden="true"
                        >
                            <path
                                fill-rule="evenodd"
                                d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                                clip-rule="evenodd"
                            />
                        </svg>
                    </button>
                )}
                {menuOpen && showRecentToggle && (
                    <ul class="absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded border border-gray-200 bg-white py-1 shadow-lg">
                        <li class="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                            Recent connections
                        </li>
                        {recentUrls.map((u) => (
                            <li key={u}>
                                <button
                                    type="button"
                                    onClick={() => pickRecent(u)}
                                    title={u}
                                    class="block w-full truncate px-3 py-1.5 text-left font-mono text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700"
                                >
                                    {u}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
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
