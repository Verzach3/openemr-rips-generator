import { prisma } from "./db";
import type { Prisma } from "../../generated/prisma/client";

export interface ExplorerQuery {
    pageIndex: number;
    pageSize: number;
    sorting: { id: string; desc: boolean }[];
    filters: { id: string; value: string | [number, number] }[];
}

export interface ExplorerResult {
    rows: {
        id: number;
        tableName: string;
        externalId: number;
        codigo: string;
        nombre: string;
        descripcion: string | null;
        habilitado: boolean;
        creationDateTime: string | null;
        lastUpdateDateTime: string | null;
        extraI: string | null;
        extraII: string | null;
        extraIII: string | null;
        extraIV: string | null;
        extraV: string | null;
        extraVI: string | null;
        extraVII: string | null;
        extraVIII: string | null;
        extraIX: string | null;
        extraX: string | null;
        valor: string | null;
        updatedAt: string;
    }[];
    rowCount: number;
    pageCount: number;
}

// Columns that support sorting
const SORTABLE_COLUMNS = new Set([
    "id", "tableName", "externalId", "codigo", "nombre",
    "descripcion", "habilitado", "updatedAt",
    "creationDateTime", "lastUpdateDateTime", "valor",
    "extraI", "extraII", "extraIII",
]);

// Columns that support text filtering
const FILTERABLE_TEXT_COLUMNS = new Set([
    "tableName", "codigo", "nombre", "descripcion", "valor",
    "extraI", "extraII", "extraIII", "extraIV", "extraV",
    "extraVI", "extraVII", "extraVIII", "extraIX", "extraX",
]);

export async function queryReferenceRecords(query: ExplorerQuery): Promise<ExplorerResult> {
    const { pageIndex, pageSize, sorting, filters } = query;

    // Build where clause from filters
    const where: Prisma.ReferenceRecordWhereInput = {};
    const andConditions: Prisma.ReferenceRecordWhereInput[] = [];

    for (const filter of filters) {
        if (filter.id === "tableName" && typeof filter.value === "string" && filter.value) {
            // Exact match for tableName (select filter)
            andConditions.push({ tableName: filter.value });
        } else if (FILTERABLE_TEXT_COLUMNS.has(filter.id) && typeof filter.value === "string" && filter.value) {
            andConditions.push({
                [filter.id]: { contains: filter.value },
            });
        }
    }

    if (andConditions.length > 0) {
        where.AND = andConditions;
    }

    // Build orderBy from sorting
    const orderBy: Prisma.ReferenceRecordOrderByWithRelationInput[] = [];
    for (const sort of sorting) {
        if (SORTABLE_COLUMNS.has(sort.id)) {
            orderBy.push({ [sort.id]: sort.desc ? "desc" : "asc" });
        }
    }
    if (orderBy.length === 0) {
        orderBy.push({ id: "asc" });
    }

    // Execute count + query in parallel
    const [rowCount, rows] = await Promise.all([
        prisma.referenceRecord.count({ where }),
        prisma.referenceRecord.findMany({
            where,
            orderBy,
            skip: pageIndex * pageSize,
            take: pageSize,
        }),
    ]);

    return {
        rows: rows.map((r) => ({
            id: r.id,
            tableName: r.tableName,
            externalId: r.externalId,
            codigo: r.codigo,
            nombre: r.nombre,
            descripcion: r.descripcion,
            habilitado: r.habilitado,
            creationDateTime: r.creationDateTime,
            lastUpdateDateTime: r.lastUpdateDateTime,
            extraI: r.extraI,
            extraII: r.extraII,
            extraIII: r.extraIII,
            extraIV: r.extraIV,
            extraV: r.extraV,
            extraVI: r.extraVI,
            extraVII: r.extraVII,
            extraVIII: r.extraVIII,
            extraIX: r.extraIX,
            extraX: r.extraX,
            valor: r.valor,
            updatedAt: r.updatedAt.toISOString(),
        })),
        rowCount,
        pageCount: Math.ceil(rowCount / pageSize),
    };
}

export async function getDistinctTableNames(): Promise<string[]> {
    const results = await prisma.referenceRecord.findMany({
        select: { tableName: true },
        distinct: ["tableName"],
        orderBy: { tableName: "asc" },
    });
    return results.map((r) => r.tableName);
}
