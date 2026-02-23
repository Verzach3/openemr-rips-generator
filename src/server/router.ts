import { os } from "@orpc/server";
import { z } from "zod";
import { eventIterator } from "@orpc/server";
import { getSyncStatus, syncAllTables, type SyncEvent } from "./sync";
import { queryReferenceRecords, getDistinctTableNames } from "./explorer";
import { prisma } from "./db";
import { getOpenEmrTableNames, getOpenEmrTableColumns } from "./openemr/schema";
import { generateRipsJson } from "./rips-generator";
import { getLocalTableNames, getLocalTableColumns, getDistinctValues } from "./local-schema";

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

// RIPS procedures
const ripsGetPresets = os.handler(async () => {
    return await prisma.ripsPreset.findMany({
        orderBy: { name: "asc" },
    });
});

const ripsSavePreset = os
    .input(z.object({
        id: z.number().optional(),
        name: z.string().min(1),
        description: z.string().optional().nullable(),
        mapping: z.string(), // JSON
    }))
    .handler(async ({ input }) => {
        if (input.id) {
            return await prisma.ripsPreset.update({
                where: { id: input.id },
                data: {
                    name: input.name,
                    description: input.description,
                    mapping: input.mapping,
                },
            });
        } else {
            return await prisma.ripsPreset.create({
                data: {
                    name: input.name,
                    description: input.description,
                    mapping: input.mapping,
                },
            });
        }
    });

const ripsDeletePreset = os
    .input(z.object({ id: z.number() }))
    .handler(async ({ input }) => {
        await prisma.ripsPreset.delete({ where: { id: input.id } });
        return { success: true };
    });

const ripsGetOpenEmrTables = os.handler(async () => {
    return await getOpenEmrTableNames();
});

const ripsGetOpenEmrColumns = os
    .input(z.object({ tableName: z.string() }))
    .handler(async ({ input }) => {
        return await getOpenEmrTableColumns(input.tableName);
    });

const ripsGetLocalTables = os.handler(async () => {
    return await getLocalTableNames();
});

const ripsGetLocalColumns = os
    .input(z.object({ tableName: z.string() }))
    .handler(async ({ input }) => {
        return await getLocalTableColumns(input.tableName);
    });

const ripsGetDistinctValues = os
    .input(z.object({
        tableName: z.string(),
        columnName: z.string(),
        search: z.string().optional(),
        limit: z.number().min(1).max(100).optional(),
    }))
    .handler(async ({ input }) => {
        return await getDistinctValues(input.tableName, input.columnName, input.search || "", input.limit || 20);
    });

const ripsGenerate = os
    .input(z.object({
        presetId: z.number(),
        dateStart: z.string(),
        dateEnd: z.string(),
    }))
    .handler(async ({ input }) => {
        try {
            const json = await generateRipsJson(input.presetId, input.dateStart, input.dateEnd);
            return { success: true, json };
        } catch (e) {
            return { success: false, error: String(e) };
        }
    });

export const router = {
    hello: { greet, ping },
    sync: { getStatus, syncAll },
    explorer: { getTableNames: explorerGetTableNames, query: explorerQuery },
    rips: {
        getPresets: ripsGetPresets,
        savePreset: ripsSavePreset,
        deletePreset: ripsDeletePreset,
        getOpenEmrTables: ripsGetOpenEmrTables,
        getOpenEmrColumns: ripsGetOpenEmrColumns,
        getLocalTables: ripsGetLocalTables,
        getLocalColumns: ripsGetLocalColumns,
        getDistinctValues: ripsGetDistinctValues,
        generate: ripsGenerate,
    },
};
