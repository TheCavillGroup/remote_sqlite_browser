import { CellInspector } from "./components/CellInspector.tsx";
import { ConnectionBar } from "./components/ConnectionBar.tsx";
import { QueryRunner } from "./components/QueryRunner.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { StructureView } from "./components/StructureView.tsx";
import { TabBar } from "./components/TabBar.tsx";
import { TableBrowser } from "./components/TableBrowser.tsx";
import { selectConnected, useStore } from "./state/store.ts";

export function App() {
    const connected = useStore(selectConnected);
    const activeTab = useStore((s) => s.activeTab);

    return (
        <div class="flex min-h-screen flex-col bg-white md:h-screen">
            <ConnectionBar />
            {connected
                ? (
                    <>
                        <TabBar />
                        <div class="flex flex-1 flex-col md:flex-row md:overflow-hidden">
                            {activeTab === "structure" && (
                                <main class="flex-1 md:min-h-0 md:overflow-hidden">
                                    <StructureView />
                                </main>
                            )}
                            {activeTab === "browse" && (
                                <>
                                    <Sidebar />
                                    <main class="flex-1 md:min-h-0 md:overflow-hidden">
                                        <TableBrowser />
                                    </main>
                                    <CellInspector />
                                </>
                            )}
                            {activeTab === "query" && (
                                <>
                                    <main class="flex-1 md:min-h-0 md:overflow-hidden">
                                        <QueryRunner />
                                    </main>
                                    <CellInspector />
                                </>
                            )}
                        </div>
                    </>
                )
                : (
                    <div class="flex flex-1 items-center justify-center text-sm text-gray-400">
                        Connect to a remote SQLite database to get started.
                    </div>
                )}
        </div>
    );
}
