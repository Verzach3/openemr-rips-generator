import { useState, useCallback } from "react";
import { orpc } from "./lib/orpc";

interface TableStatus {
    nombre: string;
    dbNombreTabla: string;
    remoteUpdatedAt: string;
    lastSyncedAt: string | null;
    recordCount: number;
    needsSync: boolean;
    estadoEntidad: boolean;
}

interface SyncLogEntry {
    type: "start" | "table_start" | "table_done" | "table_error" | "complete";
    message: string;
    timestamp: Date;
}

export function SyncPage() {
    const [tables, setTables] = useState<TableStatus[]>([]);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncLog, setSyncLog] = useState<SyncLogEntry[]>([]);
    const [progress, setProgress] = useState(0);
    const [currentTable, setCurrentTable] = useState("");
    const [error, setError] = useState<string | null>(null);

    const fetchStatus = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const status = await orpc.sync.getStatus();
            setTables(status as TableStatus[]);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, []);

    const handleSyncAll = useCallback(async () => {
        setSyncing(true);
        setSyncLog([]);
        setProgress(0);
        setCurrentTable("");
        setError(null);

        try {
            const iterator = await orpc.sync.syncAll();

            for await (const event of iterator) {
                const logEntry: SyncLogEntry = {
                    type: event.type,
                    message: event.message,
                    timestamp: new Date(),
                };

                setSyncLog((prev) => [...prev, logEntry]);

                if (event.progress !== undefined) {
                    setProgress(event.progress);
                }

                if (event.tableName) {
                    setCurrentTable(event.tableName);
                }

                if (event.type === "complete") {
                    setCurrentTable("");
                }
            }

            // Refresh status after sync completes
            const status = await orpc.sync.getStatus();
            setTables(status as TableStatus[]);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setSyncing(false);
        }
    }, []);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-gray-300 pb-2">
                <h1 className="text-2xl font-bold text-gray-900">
                    Reference Data Sync
                </h1>
                <div className="flex items-center gap-2">
                    <button
                        className="btn-primary"
                        onClick={fetchStatus}
                        disabled={loading || syncing}
                    >
                        {loading ? "Loading…" : "Check Status"}
                    </button>
                    <button
                        className="bg-emerald-700 text-white px-4 py-1.5 text-sm font-semibold hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        onClick={handleSyncAll}
                        disabled={syncing || loading}
                    >
                        {syncing ? "Syncing…" : "Sync All"}
                    </button>
                </div>
            </div>

            <p className="text-gray-700 text-sm">
                Synchronize SISPRO reference tables (RIPS v2) with the local database.
                Click <strong>Check Status</strong> to see which tables need updating,
                then <strong>Sync All</strong> to pull the latest data.
            </p>

            {error && (
                <div className="bg-red-50 border border-red-300 text-red-800 text-sm p-3">
                    <strong>Error:&nbsp;</strong>
                    {error}
                </div>
            )}

            {/* Sync Progress Panel */}
            {syncing && (
                <div className="enterprise-panel">
                    <h2 className="text-lg font-bold text-gray-900 mb-2 border-b border-gray-200 pb-2">
                        Sync Progress
                    </h2>

                    {/* Progress bar */}
                    <div className="w-full bg-gray-200 h-3 mb-2">
                        <div
                            className="bg-emerald-600 h-3 transition-all duration-300"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <div className="flex justify-between text-xs text-gray-600 mb-3">
                        <span>
                            {currentTable
                                ? `Syncing: ${currentTable}`
                                : "Preparing…"}
                        </span>
                        <span>{progress}%</span>
                    </div>

                    {/* Log area */}
                    <div className="bg-gray-900 text-gray-100 text-xs font-mono p-3 max-h-48 overflow-y-auto">
                        {syncLog.map((entry, i) => (
                            <div
                                key={i}
                                className={
                                    entry.type === "table_error"
                                        ? "text-red-400"
                                        : entry.type === "table_done"
                                            ? "text-emerald-400"
                                            : entry.type === "complete"
                                                ? "text-yellow-300 font-bold"
                                                : "text-gray-300"
                                }
                            >
                                <span className="text-gray-500 mr-2">
                                    {entry.timestamp.toLocaleTimeString()}
                                </span>
                                {entry.message}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Completed sync log (after sync finishes) */}
            {!syncing && syncLog.length > 0 && (
                <div className="enterprise-panel">
                    <h2 className="text-lg font-bold text-gray-900 mb-2 border-b border-gray-200 pb-2">
                        Last Sync Results
                    </h2>
                    <div className="bg-gray-900 text-gray-100 text-xs font-mono p-3 max-h-48 overflow-y-auto">
                        {syncLog.map((entry, i) => (
                            <div
                                key={i}
                                className={
                                    entry.type === "table_error"
                                        ? "text-red-400"
                                        : entry.type === "table_done"
                                            ? "text-emerald-400"
                                            : entry.type === "complete"
                                                ? "text-yellow-300 font-bold"
                                                : "text-gray-300"
                                }
                            >
                                <span className="text-gray-500 mr-2">
                                    {entry.timestamp.toLocaleTimeString()}
                                </span>
                                {entry.message}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Table Status Grid */}
            {tables.length > 0 && (
                <div className="enterprise-panel">
                    <h2 className="text-lg font-bold text-gray-900 mb-2 border-b border-gray-200 pb-2">
                        Reference Tables ({tables.length})
                    </h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead>
                                <tr className="border-b border-gray-300 text-gray-700 text-xs uppercase tracking-wide">
                                    <th className="py-2 pr-4">Table</th>
                                    <th className="py-2 pr-4">Status</th>
                                    <th className="py-2 pr-4">Records</th>
                                    <th className="py-2 pr-4">Remote Updated</th>
                                    <th className="py-2 pr-4">Last Synced</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tables.map((t) => (
                                    <tr
                                        key={t.nombre}
                                        className="border-b border-gray-100 hover:bg-gray-50"
                                    >
                                        <td className="py-2 pr-4 font-mono text-xs">
                                            {t.nombre}
                                        </td>
                                        <td className="py-2 pr-4">
                                            {t.needsSync ? (
                                                <span className="inline-block bg-amber-100 text-amber-800 text-xs px-2 py-0.5 font-semibold">
                                                    Needs Sync
                                                </span>
                                            ) : (
                                                <span className="inline-block bg-emerald-100 text-emerald-800 text-xs px-2 py-0.5 font-semibold">
                                                    Up to Date
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-2 pr-4 text-gray-700">
                                            {t.recordCount.toLocaleString()}
                                        </td>
                                        <td className="py-2 pr-4 text-gray-600 text-xs">
                                            {new Date(t.remoteUpdatedAt).toLocaleDateString()}
                                        </td>
                                        <td className="py-2 pr-4 text-gray-600 text-xs">
                                            {t.lastSyncedAt
                                                ? new Date(t.lastSyncedAt).toLocaleString()
                                                : "Never"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
