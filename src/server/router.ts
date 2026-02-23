import { os } from "@orpc/server";
import { z } from "zod";
import { eventIterator } from "@orpc/server";
import { getSyncStatus, syncAllTables, type SyncEvent } from "./sync";

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

export const router = {
    hello: { greet, ping },
    sync: { getStatus, syncAll },
};
