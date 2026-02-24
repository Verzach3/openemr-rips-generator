import { os } from "@orpc/server";
import { z } from "zod";
import { searchPatients, getEncountersForPatients, getPatientsRipsData, getFacilityById } from "./openemr/queries";
import { getRipUserTypes, createRipsGenerationRecord } from "./rips-helper";

const searchPatientsProcedure = os
    .input(z.object({ term: z.string().min(1) }))
    .handler(async ({ input }) => {
        return await searchPatients(input.term);
    });

const getEncountersProcedure = os
    .input(
        z.object({
            patientIds: z.array(z.number()),
            startDate: z.string().optional(),
            endDate: z.string().optional(),
        })
    )
    .handler(async ({ input }) => {
        const start = input.startDate ? new Date(input.startDate) : undefined;
        const end = input.endDate ? new Date(input.endDate) : undefined;
        return await getEncountersForPatients(input.patientIds, start, end);
    });

const getMetaDataProcedure = os.handler(async () => {
    return await getRipUserTypes();
});

const generateProcedure = os
    .input(
        z.object({
            // Array of patient selections
            selections: z.array(
                z.object({
                    patientId: z.number(),
                    encounterIds: z.array(z.number()),
                    userType: z.string(), // Código from ReferenceRecord
                })
            ),
        })
    )
    .handler(async ({ input }) => {
        // 1. Fetch Facility Data (Assume ID 1 or Primary)
        // In a real app, we might select the facility from the UI or based on the encounter.
        // We'll try ID 1 for now as a default.
        const facility = await getFacilityById(1);
        if (!facility) {
            throw new Error("Facility with ID 1 not found. Cannot generate RIPS.");
        }

        // 2. Fetch Patient Data for all selected patients
        const patientIds = input.selections.map((s) => s.patientId);
        const patients = await getPatientsRipsData(patientIds);
        const patientMap = new Map(patients.map((p) => [p.pid, p]));

        // 3. Fetch Encounters (we need details like invoice_refno)
        // We could optimize this by fetching only specific encounters, but reusing getEncounters is easier if we filter.
        // Better: Fetch specific encounters by ID?
        // Queries.ts doesn't have getEncountersByIds.
        // But getEncountersForPatients returns all for those patients. We can filter in memory.
        const allEncounters = await getEncountersForPatients(patientIds);
        const encounterMap = new Map(allEncounters.map((e) => [e.id, e]));

        // 4. Create Generation Record to get Consecutive ID
        // Count total unique users being reported? Or just one record for the file?
        // "It should be a consecutive non repetitive number for every RIPS generated" -> File Sequence.
        // We'll create it now.
        const generationRecord = await createRipsGenerationRecord(input.selections.length, "RIPS_JSON");
        const consecutivoFile = generationRecord.id;

        // 5. Build JSON
        const usuarios = [];
        let userConsecutive = 1;

        for (const selection of input.selections) {
            const patient = patientMap.get(selection.patientId);
            if (!patient) continue;

            const patientEncounters = selection.encounterIds
                .map((id) => encounterMap.get(id))
                .filter((e) => e !== undefined);

            if (patientEncounters.length === 0) continue; // Skip if no encounters selected (shouldn't happen if UI enforces it)

            // RIPS JSON structure for one user
            // Note: The prompt example structure groups services under the user.
            // But usually RIPS reports services per invoice/encounter.
            // If multiple encounters, we might need to aggregate them?
            // "servicios": { "consultas": [...], ... }
            // We will map encounters to "consultas" for now as a placeholder/start.
            // Or leave "servicios" empty as requested ("ir paso a paso").

            // "numFactura": The prompt has it at "transaccion" level.
            // "transaccion": { "numFactura": "FEV123", ... }
            // This implies ONE invoice per file? Or does the JSON support multiple invoices?
            // The JSON structure in the prompt:
            /*
            {
              "transaccion": {
                "numDocumentoIdObligado": "...",
                "numFactura": "FEV123",
                "usuarios": [ ... ]
              }
            }
            */
            // If the structure puts "numFactura" at the root ("transaccion"), then a RIPS file corresponds to ONE INVOICE.
            // This means we should probably only allow selecting encounters from ONE invoice, or generate multiple files?
            // OR, maybe the prompt's JSON example is simplified/specific.
            // Usually RIPS (JSON) allows multiple invoices?
            // Wait, looking at the JSON: "numFactura": "FEV123".
            // If I select multiple encounters from different invoices, this structure breaks.
            // **Assumption**: I will take the invoice number from the *first* selected encounter and assume all selected encounters belong to it,
            // OR simply comma-separate them if multiple?
            // Better: I will use the first encounter's invoice number for the root "numFactura".
            // If the user selects encounters with different invoice numbers, this might be invalid RIPS, but I'll follow the structure provided.

            const userObj = {
                tipoDocumentoIdentificacion: patient.document_type || "CC", // Default if missing
                numDocumentoIdentificacion: patient.ss || "",
                tipoUsuario: selection.userType,
                fechaNacimiento: patient.DOB ? new Date(patient.DOB).toISOString().split('T')[0] : "",
                codSexo: patient.sex || "",
                codPaisResidencia: patient.country_code || "170", // Colombia default
                codMunicipioResidencia: patient.city || "", // Needs proper code
                incapacidad: "NO",
                consecutivo: userConsecutive++,
                servicios: {
                    consultas: [],
                    procedimientos: [],
                    medicamentos: [],
                    urgencias: [],
                    hospitalizacion: [],
                    recienNacidos: [],
                    otrosServicios: []
                }
            };
            usuarios.push(userObj);
        }

        // Get invoice number from the first selected encounter of the first patient (best guess for single-invoice RIPS)
        // Or if the user selects multiple, maybe we should warn?
        // For now, simple implementation.
        let numFactura = "";
        if (input.selections.length > 0 && input.selections[0].encounterIds.length > 0) {
            const firstEncId = input.selections[0].encounterIds[0];
            const enc = encounterMap.get(firstEncId);
            if (enc) numFactura = enc.invoice_refno || "";
        }

        const ripsJson = {
            transaccion: {
                numDocumentoIdObligado: facility.federal_ein || "",
                numFactura: numFactura,
                tipoNota: null,
                numNota: null,
                usuarios: usuarios
            }
        };

        return {
            json: ripsJson,
            filename: `RIPS_${consecutivoFile}.json`,
            consecutivo: consecutivoFile
        };
    });

export const ripsRouter = {
    searchPatients: searchPatientsProcedure,
    getEncounters: getEncountersProcedure,
    getMetaData: getMetaDataProcedure,
    generate: generateProcedure,
};
