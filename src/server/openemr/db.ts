import { createPool } from "mysql2";
import { Kysely, MysqlDialect } from "kysely";
import type { DB } from 'kysely-codegen';

// Ensure the environment variable is loaded
if (!process.env.OPENEMR_URL) {
    console.warn("WARNING: OPENEMR_URL environment variable is not defined.");
}

const dialect = new MysqlDialect({
    pool: createPool({
        uri: process.env.OPENEMR_URL || "mysql://openemr:openemr@localhost:3306/openemr",
        connectionLimit: 10,
        waitForConnections: true,
    }),
});

/**
 * Singleton Kysely instance for the OpenEMR MySQL DB
 * This instance automatically resolves the types for queries.
 */
export const openemrDb = new Kysely<DB>({
    dialect,
});
