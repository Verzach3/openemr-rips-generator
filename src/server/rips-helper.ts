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

/**
 * Ensure default RIPS Incapacidad options exist in the database.
 * This is a self-healing step to make sure the options are configurable.
 */
export async function ensureRipsIncapacidadOptions() {
    const TABLE_NAME = "RIPSIncapacidad";

    // Check if any exist
    const count = await prisma.referenceRecord.count({
        where: { tableName: TABLE_NAME }
    });

    if (count === 0) {
        console.log("Seeding RIPS Incapacidad options...");
        // Insert defaults safely using transaction
        // extraI: '1' for true, '0' for false
        await prisma.$transaction([
            prisma.referenceRecord.create({
                data: {
                    tableName: TABLE_NAME,
                    codigo: "SI",
                    nombre: "Si",
                    extraI: "1",
                    habilitado: true,
                    externalId: 1
                }
            }),
            prisma.referenceRecord.create({
                data: {
                    tableName: TABLE_NAME,
                    codigo: "NO",
                    nombre: "No",
                    extraI: "0",
                    habilitado: true,
                    externalId: 2
                }
            })
        ]);
    }
}

/**
 * Fetch available Incapacidad options for RIPS
 */
export async function getRipIncapacidades() {
    return await prisma.referenceRecord.findMany({
        where: {
            tableName: "RIPSIncapacidad",
            habilitado: true,
        },
        select: {
            codigo: true,
            nombre: true,
            extraI: true // Needed to map logic
        }
    });
}
