import { os } from "@orpc/server";
import { z } from "zod";
import { eventIterator } from "@orpc/server";
import { getSyncStatus, syncAllTables, type SyncEvent } from "./sync";
import { queryReferenceRecords, getDistinctTableNames } from "./explorer";

const greet = os
    .input(z.object({ name: z.string() }))
    .handler(async ({ input }) => {
        return { message: `Hello, ${input.name}!` };
    });

const ping = os.handler(async () => {
    return { pong: true as const, timestamp: new Date().toISOString() };
});

const getStatus = os.handler(async () => {
    return await getSyncStatus();
});

const syncAll = os
    .output(
        eventIterator(
            z.object({
                type: z.enum([
                    "start",
                    "table_start",
                    "table_done",
                    "table_error",
                    "complete",
                ]),
                tableName: z.string().optional(),
                message: z.string(),
                progress: z.number().optional(),
                totalTables: z.number().optional(),
                currentTable: z.number().optional(),
                recordCount: z.number().optional(),
                error: z.string().optional(),
            })
        )
    )
    .handler(async function* () {
        for await (const event of syncAllTables()) {
            yield event;
        }
    });

// Explorer procedures
const explorerGetTableNames = os.handler(async () => {
    return await getDistinctTableNames();
});

const explorerQuery = os
    .input(
        z.object({
            pageIndex: z.number().int().min(0),
            pageSize: z.number().int().min(1).max(100),
            sorting: z.array(
                z.object({
                    id: z.string(),
                    desc: z.boolean(),
                })
            ),
            filters: z.array(
                z.object({
                    id: z.string(),
                    value: z.union([z.string(), z.tuple([z.number(), z.number()])]),
                })
            ),
        })
    )
    .handler(async ({ input }) => {
        return await queryReferenceRecords(input);
    });

export const router = {
    hello: { greet, ping },
    sync: { getStatus, syncAll },
    explorer: { getTableNames: explorerGetTableNames, query: explorerQuery },
};
