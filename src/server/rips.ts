import { os } from "@orpc/server";
import { z } from "zod";
import { searchPatients, getEncountersForPatients, getPatientsRipsData, getFacilityById, getFacilities, getBillingOptionsByEncounterIds, getBillingRecords, getPrescriptions, getProvidersByIds } from "./openemr/queries";
import { getRipUserTypes, createRipsGenerationRecord, ensureRipsIncapacidadOptions, getRipIncapacidades } from "./rips-helper";
import { validateRipsJson } from "./rips-validator";
import { mapTransaction } from "./rips/mappers/transaction-mapper";
import { mapUser } from "./rips/mappers/user-mapper";
import { mapConsultation, mapMedication, mapProcedure } from "./rips/mappers/service-mapper";
import type { RipsServices, RipsUser } from "./rips/types";

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
                    userType: z.string().optional(), // Código from ReferenceRecord (optional now, inferred from DB if possible)
                })
            ),
        })
    )
    .handler(async ({ input }) => {
        try {
            // 1. Fetch Facility Data (Assume ID 1 or Primary)
            // In a real app, we might select the facility from the UI or based on the encounter.
            // We'll try ID 1 for now as a default.
            const facility = (await getFacilities())[0];
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

            // 4. Fetch Billing Options for selected encounters (for Incapacidad logic)
            // Ensure options exist and fetch them
            await ensureRipsIncapacidadOptions();
            const incapOptions = await getRipIncapacidades();
            // Map logic: '1' -> SI, '0' -> NO. Default to 'SI'/'NO' if not configured properly.
            const siOption = incapOptions.find((o) => o.extraI === "1")?.codigo || "SI";
            const noOption = incapOptions.find((o) => o.extraI === "0")?.codigo || "NO";

            const allEncounterNumbers: number[] = [];
            const allProviderIds: number[] = [];
            for (const selection of input.selections) {
                for (const encId of selection.encounterIds) {
                    const enc = encounterMap.get(encId);
                    if (enc && enc.encounter) {
                        allEncounterNumbers.push(enc.encounter);
                    }
                    if (enc && enc.provider_id) {
                         allProviderIds.push(enc.provider_id);
                    }
                }
            }

            // Parallel fetch for billing options, records, and prescriptions
            const [billingOptions, billingRecords, prescriptionRecords, providers] = await Promise.all([
                getBillingOptionsByEncounterIds(allEncounterNumbers),
                getBillingRecords(allEncounterNumbers),
                getPrescriptions(allEncounterNumbers),
                getProvidersByIds(allProviderIds)
            ]);

            const billingMap = new Map<number, number | null>();
            for (const opt of billingOptions) {
                if (opt.encounter) {
                    billingMap.set(opt.encounter, opt.is_unable_to_work);
                }
            }

            // Group Billing Records by Encounter
            const billingRecordsByEncounter = new Map<number, typeof billingRecords>();
            for (const rec of billingRecords) {
                if (!rec.encounter) continue;
                if (!billingRecordsByEncounter.has(rec.encounter)) {
                    billingRecordsByEncounter.set(rec.encounter, []);
                }
                billingRecordsByEncounter.get(rec.encounter)!.push(rec);
            }

            // Group Prescriptions by Encounter
            const prescriptionsByEncounter = new Map<number, typeof prescriptionRecords>();
            for (const pre of prescriptionRecords) {
                if (!pre.encounter) continue;
                if (!prescriptionsByEncounter.has(pre.encounter)) {
                    prescriptionsByEncounter.set(pre.encounter, []);
                }
                prescriptionsByEncounter.get(pre.encounter)!.push(pre);
            }

            // Map Providers by ID
            const providerMap = new Map<number, typeof providers[0]>();
            for (const prov of providers) {
                providerMap.set(prov.id, prov);
            }

            // 5. Create Generation Record to get Consecutive ID
            const generationRecord = await createRipsGenerationRecord(input.selections.length, "RIPS_JSON");
            const consecutivoFile = generationRecord.id;

            // 6. Build JSON using Mappers
            const ripsUsers: RipsUser[] = [];
            let userConsecutive = 1;

            for (const selection of input.selections) {
                const patient = patientMap.get(selection.patientId);
                if (!patient) continue;

                const patientEncounters = selection.encounterIds
                    .map((id) => encounterMap.get(id))
                    .filter((e) => e !== undefined);

                if (patientEncounters.length === 0) continue;

                // Determine Incapacidad based on encounters
                let incapacidad = noOption;
                for (const encId of selection.encounterIds) {
                    const enc = encounterMap.get(encId);
                    if (!enc || !enc.encounter) continue;

                    const isUnable = billingMap.get(enc.encounter);
                    if (isUnable === 1) { // 1 is true
                        incapacidad = siOption;
                        break; // Found an affirmative, set to SI
                    }
                }

                // Initialize Services Container
                const services: RipsServices = {
                    consultas: [],
                    procedimientos: [],
                    medicamentos: [],
                    urgencias: [],
                    hospitalizacion: [],
                    recienNacidos: [],
                    otrosServicios: []
                };

                for (const enc of patientEncounters) {
                    if (!enc.encounter) continue;

                    const billingItems = billingRecordsByEncounter.get(enc.encounter) || [];
                    const presItems = prescriptionsByEncounter.get(enc.encounter) || [];

                    // Identify Diagnoses (code_type == 'RIPS') and Procedures (code_type == '4')
                    const diagnoses = billingItems.filter(b => b.code_type === 'RIPS');
                    const procedures = billingItems.filter(b => b.code_type === '4');

                    // 1. Map Consultas (Treat every encounter as a Consulta)
                    services.consultas.push(
                        mapConsultation(enc, facility.federal_ein || "", diagnoses, providerMap, services.consultas.length + 1)
                    );

                    // 2. Map Procedimientos
                    for (const proc of procedures) {
                        services.procedimientos.push(
                            mapProcedure(proc, enc, facility.federal_ein || "", diagnoses, providerMap, services.procedimientos.length + 1)
                        );
                    }

                    // 3. Map Medicamentos
                    for (const med of presItems) {
                        services.medicamentos.push(
                            mapMedication(med, enc, facility.federal_ein || "", diagnoses, providerMap, services.medicamentos.length + 1)
                        );
                    }
                }

                // Map User
                ripsUsers.push(
                    mapUser(patient, selection.userType, incapacidad, userConsecutive++, services)
                );
            }

            // Get invoice number from the first selected encounter of the first patient
            let numFactura = "";
            const firstSelection = input.selections[0];
            if (firstSelection) {
                const firstEncId = firstSelection.encounterIds[0];
                if (firstEncId !== undefined) {
                    const enc = encounterMap.get(firstEncId);
                    if (enc) numFactura = enc.invoice_refno || "";
                }
            }

            // Map Final Transaction
            const ripsJson = {
                transaccion: mapTransaction(facility.federal_ein || "", numFactura, ripsUsers)
            };

            const validationErrors = validateRipsJson(ripsJson);

            return {
                json: ripsJson,
                filename: `RIPS_${consecutivoFile}.json`,
                consecutivo: consecutivoFile,
                validationErrors
            };
        } catch (error) {
            console.error("[rips.generate] Failed to generate RIPS", {
                selectionCount: input.selections.length,
                patientIds: input.selections.map((s) => s.patientId),
                error,
            });

            if (error instanceof Error) {
                throw error;
            }

            throw new Error("Unexpected error while generating RIPS.");
        }
    });

export const ripsRouter = {
    searchPatients: searchPatientsProcedure,
    getEncounters: getEncountersProcedure,
    getMetaData: getMetaDataProcedure,
    generate: generateProcedure,
};
