import { ConnectionBar } from "./components/ConnectionBar.tsx";
import { QueryRunner } from "./components/QueryRunner.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { TableBrowser } from "./components/TableBrowser.tsx";
import * as store from "./state/store.ts";

export function App() {
    return (
        <div class="flex h-screen flex-col bg-white">
            <ConnectionBar />
            {store.connected.value
                ? (
                    <div class="flex flex-1 overflow-hidden">
                        <Sidebar />
                        <main class="flex-1 overflow-hidden">
                            {store.activeTab.value === "query" ? <QueryRunner /> : <TableBrowser />}
                        </main>
                    </div>
                )
                : (
                    <div class="flex flex-1 items-center justify-center text-sm text-gray-400">
                        Connect to a remote SQLite database to get started.
                    </div>
                )}
        </div>
    );
}
