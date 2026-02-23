import { prisma } from "./db";

// For SQLite, we can query sqlite_master for table info
// Or just hardcode the known Prisma models since we control the schema
export async function getLocalTableNames(): Promise<string[]> {
    // We know our models from schema.prisma
    return ["SyncTable", "ReferenceRecord", "RipsPreset"];
}

export async function getLocalTableColumns(tableName: string): Promise<{ Field: string; Type: string }[]> {
    // Validate table name to prevent SQL injection, though prisma query raw handles quoting
    // SQLite doesn't have a DESCRIBE like MySQL, but PRAGMA table_info works
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
        return [];
    }

    // Using raw query for SQLite to get column info
    try {
        const result = await prisma.$queryRawUnsafe<any[]>(`PRAGMA table_info(${tableName})`);
        return result.map((col: any) => ({
            Field: col.name,
            Type: col.type,
        }));
    } catch (e) {
        console.error(`Failed to get columns for local table ${tableName}`, e);
        return [];
    }
}

export async function getDistinctValues(tableName: string, columnName: string, search: string = "", limit: number = 20): Promise<string[]> {
    // Validate table/column names to prevent injection (basic check)
    if (!/^[a-zA-Z0-9_]+$/.test(tableName) || !/^[a-zA-Z0-9_]+$/.test(columnName)) {
        return [];
    }

    try {
        const result = await prisma.$queryRawUnsafe<any[]>(`
            SELECT DISTINCT ${columnName} as val
            FROM ${tableName}
            WHERE CAST(${columnName} AS TEXT) LIKE ?
            ORDER BY ${columnName} ASC
            LIMIT ?
        `, `%${search}%`, limit);
        return result.map((r: any) => String(r.val)).filter((v: string) => v !== null && v !== "");
    } catch (e) {
        console.error(`Failed to get distinct values for ${tableName}.${columnName}`, e);
        return [];
    }
}
