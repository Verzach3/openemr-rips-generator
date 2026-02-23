import { sql } from "kysely";
import { openemrDb } from "./db";

export async function getOpenEmrTableNames(): Promise<string[]> {
    // SHOW TABLES returns rows with a dynamic key like "Tables_in_dbname"
    const result = await sql<Record<string, string>>`SHOW TABLES`.execute(openemrDb);
    return result.rows.map((row) => Object.values(row)[0]);
}

export interface ColumnInfo {
    Field: string;
    Type: string;
    Null: string;
    Key: string;
    Default: string | null;
    Extra: string;
}

export async function getOpenEmrTableColumns(tableName: string): Promise<ColumnInfo[]> {
    // Validate table name to prevent SQL injection, though sql.id handles quoting
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
        throw new Error("Invalid table name");
    }

    const result = await sql<ColumnInfo>`DESCRIBE ${sql.id(tableName)}`.execute(openemrDb);
    return result.rows;
}
