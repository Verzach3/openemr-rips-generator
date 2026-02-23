import { prisma } from "./db";

const SISPRO_STATUS_URL =
    "https://fevrips.sispro.gov.co/fevrips-api/api/SincronizacionDatos/GetEstado";

/** Shape of each entry from the GetEstado endpoint */
interface SisproTableInfo {
    nombre: string;
    dbNombreTablaSISPRO: string;
    dbNombreTabla: string;
    urlTablaSISPRO: string;
    fechaActualizacion: string;
    id: number;
    estadoEntidad: boolean;
}

/** Shape of each record in every reference table endpoint */
interface SisproRecord {
    ID: number;
    Codigo: string;
    Nombre: string;
    Descripcion: string | null;
    Habilitado: boolean;
    CreationDateTime: string | null;
    LastUpdateDateTime: string | null;
    Extra_I: string | null;
    Extra_II: string | null;
    Extra_III: string | null;
    Extra_IV: string | null;
    Extra_V: string | null;
    Extra_VI: string | null;
    Extra_VII: string | null;
    Extra_VIII: string | null;
    Extra_IX: string | null;
    Extra_X: string | null;
    Valor: string | null;
}

/** SSE event payload sent to the client */
export interface SyncEvent {
    type: "start" | "table_start" | "table_done" | "table_error" | "complete";
    tableName?: string;
    message: string;
    progress?: number; // 0-100
    totalTables?: number;
    currentTable?: number;
    recordCount?: number;
    error?: string;
}

/**
 * Fetches the list of available tables from SISPRO and returns their status
 * compared with our local sync state.
 */
export async function getSyncStatus() {
    const response = await fetch(SISPRO_STATUS_URL);
    if (!response.ok) {
        throw new Error(`Failed to fetch SISPRO status: ${response.status}`);
    }

    const remoteTables: SisproTableInfo[] = await response.json();

    // Deduplicate by nombre (the API returns some duplicates)
    const uniqueTables = new Map<string, SisproTableInfo>();
    for (const table of remoteTables) {
        if (!uniqueTables.has(table.nombre)) {
            uniqueTables.set(table.nombre, table);
        }
    }

    // Get local sync records
    const localTables = await prisma.syncTable.findMany();
    const localMap = new Map(localTables.map((t) => [t.nombre, t]));

    const status = Array.from(uniqueTables.values()).map((remote) => {
        const local = localMap.get(remote.nombre);
        return {
            nombre: remote.nombre,
            dbNombreTabla: remote.dbNombreTabla,
            urlTablaSISPRO: remote.urlTablaSISPRO,
            remoteUpdatedAt: remote.fechaActualizacion,
            lastSyncedAt: local?.lastSyncedAt?.toISOString() ?? null,
            recordCount: local?.recordCount ?? 0,
            needsSync:
                !local ||
                !local.lastSyncedAt ||
                new Date(remote.fechaActualizacion) > local.lastSyncedAt,
            estadoEntidad: remote.estadoEntidad,
        };
    });

    return status;
}

/**
 * Async generator that syncs all SISPRO reference tables and yields progress events.
 */
export async function* syncAllTables(): AsyncGenerator<SyncEvent> {
    // 1. Fetch remote table list
    const response = await fetch(SISPRO_STATUS_URL);
    if (!response.ok) {
        throw new Error(`Failed to fetch SISPRO status: ${response.status}`);
    }

    const remoteTables: SisproTableInfo[] = await response.json();

    // Deduplicate
    const uniqueTables = new Map<string, SisproTableInfo>();
    for (const table of remoteTables) {
        if (!uniqueTables.has(table.nombre)) {
            uniqueTables.set(table.nombre, table);
        }
    }

    const tables = Array.from(uniqueTables.values());
    const totalTables = tables.length;

    yield {
        type: "start",
        message: `Starting sync of ${totalTables} reference tables...`,
        totalTables,
        progress: 0,
    };

    let completed = 0;

    for (const table of tables) {
        completed++;
        const progress = Math.round((completed / totalTables) * 100);

        yield {
            type: "table_start",
            tableName: table.nombre,
            message: `Syncing ${table.nombre} (${completed}/${totalTables})...`,
            progress: Math.round(((completed - 1) / totalTables) * 100),
            totalTables,
            currentTable: completed,
        };

        try {
            // Fetch the reference data for this table
            const dataResponse = await fetch(table.urlTablaSISPRO);
            if (!dataResponse.ok) {
                throw new Error(`HTTP ${dataResponse.status}`);
            }

            const records: SisproRecord[] = await dataResponse.json();

            // Upsert all records using native bun:sqlite for maximum performance
            const { Database } = await import("bun:sqlite");

            // Extract the database path from DATABASE_URL or fallback
            // Extract string from e.g. "file:./prisma/dev.db" => "./prisma/dev.db"
            let dbPath = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
            if (dbPath.startsWith("file:")) {
                dbPath = dbPath.replace("file:", "");
            }

            // Connect using bun:sqlite just for the bulk import
            const sqliteDb = new Database(dbPath);

            // Prepared statement for fast upsert
            const stmt = sqliteDb.prepare(`
                INSERT INTO ReferenceRecord (
                    tableName, externalId, codigo, nombre, descripcion, habilitado,
                    creationDateTime, lastUpdateDateTime, extraI, extraII, extraIII, 
                    extraIV, extraV, extraVI, extraVII, extraVIII, extraIX, extraX, valor,
                    updatedAt
                ) VALUES (
                    $tableName, $externalId, $codigo, $nombre, $descripcion, $habilitado,
                    $creationDateTime, $lastUpdateDateTime, $extraI, $extraII, $extraIII,
                    $extraIV, $extraV, $extraVI, $extraVII, $extraVIII, $extraIX, $extraX, $valor,
                    (datetime('now'))
                )
                ON CONFLICT(tableName, externalId) DO UPDATE SET
                    codigo=excluded.codigo,
                    nombre=excluded.nombre,
                    descripcion=excluded.descripcion,
                    habilitado=excluded.habilitado,
                    creationDateTime=excluded.creationDateTime,
                    lastUpdateDateTime=excluded.lastUpdateDateTime,
                    extraI=excluded.extraI,
                    extraII=excluded.extraII,
                    extraIII=excluded.extraIII,
                    extraIV=excluded.extraIV,
                    extraV=excluded.extraV,
                    extraVI=excluded.extraVI,
                    extraVII=excluded.extraVII,
                    extraVIII=excluded.extraVIII,
                    extraIX=excluded.extraIX,
                    extraX=excluded.extraX,
                    valor=excluded.valor,
                    updatedAt=excluded.updatedAt;
            `);

            // Execute all INSERTS within a single transaction
            const runBulkUpsert = sqliteDb.transaction((recordsToInsert: typeof records) => {
                for (const record of recordsToInsert) {
                    stmt.run({
                        $tableName: table.nombre,
                        $externalId: record.ID,
                        $codigo: record.Codigo,
                        $nombre: record.Nombre,
                        $descripcion: record.Descripcion,
                        $habilitado: record.Habilitado ? 1 : 0, // SQLite expects 1/0 for boolean
                        $creationDateTime: record.CreationDateTime,
                        $lastUpdateDateTime: record.LastUpdateDateTime,
                        $extraI: record.Extra_I,
                        $extraII: record.Extra_II,
                        $extraIII: record.Extra_III,
                        $extraIV: record.Extra_IV,
                        $extraV: record.Extra_V,
                        $extraVI: record.Extra_VI,
                        $extraVII: record.Extra_VII,
                        $extraVIII: record.Extra_VIII,
                        $extraIX: record.Extra_IX,
                        $extraX: record.Extra_X,
                        $valor: record.Valor
                    });
                }
            });

            // Run the transaction
            runBulkUpsert(records);

            // Clean up resources immediately
            stmt.finalize();
            sqliteDb.close();

            // Update the SyncTable metadata
            await prisma.syncTable.upsert({
                where: { nombre: table.nombre },
                create: {
                    nombre: table.nombre,
                    dbNombreTabla: table.dbNombreTabla,
                    urlTablaSISPRO: table.urlTablaSISPRO,
                    fechaActualizacion: table.fechaActualizacion,
                    lastSyncedAt: new Date(),
                    recordCount: records.length,
                    estadoEntidad: table.estadoEntidad,
                },
                update: {
                    dbNombreTabla: table.dbNombreTabla,
                    urlTablaSISPRO: table.urlTablaSISPRO,
                    fechaActualizacion: table.fechaActualizacion,
                    lastSyncedAt: new Date(),
                    recordCount: records.length,
                    estadoEntidad: table.estadoEntidad,
                },
            });

            yield {
                type: "table_done",
                tableName: table.nombre,
                message: `✓ ${table.nombre}: ${records.length} records synced`,
                progress,
                totalTables,
                currentTable: completed,
                recordCount: records.length,
            };
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : String(error);

            yield {
                type: "table_error",
                tableName: table.nombre,
                message: `✗ ${table.nombre}: ${errorMessage}`,
                progress,
                totalTables,
                currentTable: completed,
                error: errorMessage,
            };
        }
    }

    yield {
        type: "complete",
        message: `Sync complete. Processed ${totalTables} tables.`,
        progress: 100,
        totalTables,
    };
}
