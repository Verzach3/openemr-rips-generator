import { prisma } from "./db";

/**
 * Fetch available user types for RIPS from local reference records
 */
export async function getRipUserTypes() {
    return await prisma.referenceRecord.findMany({
        where: {
            tableName: "RIPSTipoUsuarioVersion2",
            habilitado: true,
        },
        select: {
            codigo: true,
            nombre: true,
        },
        orderBy: {
            nombre: "asc",
        },
    });
}

/**
 * Create a new generation record and return it (the ID is the consecutive number)
 */
export async function createRipsGenerationRecord(patientCount: number, fileName?: string) {
    return await prisma.ripsGeneration.create({
        data: {
            patientCount,
            fileName
        }
    });
}

/**
 * Get the next likely consecutive number (for display purposes)
 */
export async function getNextRipsConsecutive() {
    // This is just an estimate, the real one comes from creating the record
    const lastGen = await prisma.ripsGeneration.findFirst({
        orderBy: { id: "desc" },
    });
    return (lastGen?.id ?? 0) + 1;
}
