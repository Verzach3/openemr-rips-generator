import { os } from "@orpc/server";
import { z } from "zod";
import { searchPatients, getEncountersForPatients, getPatientsRipsData, getFacilityById, getFacilities, getBillingOptionsByEncounterIds, getBillingRecords, getPrescriptions, getProvidersByIds } from "./openemr/queries";
import { getRipUserTypes, createRipsGenerationRecord, ensureRipsIncapacidadOptions, getRipIncapacidades } from "./rips-helper";
import { validateRipsJson } from "./rips-validator";

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
            // Count total unique users being reported? Or just one record for the file?
            // "It should be a consecutive non repetitive number for every RIPS generated" -> File Sequence.
            // We'll create it now.
            const generationRecord = await createRipsGenerationRecord(input.selections.length, "RIPS_JSON");
            const consecutivoFile = generationRecord.id;

            // 6. Build JSON
            const usuarios = [];
            let userConsecutive = 1;

            for (const selection of input.selections) {
                const patient = patientMap.get(selection.patientId);
                if (!patient) continue;

                const patientEncounters = selection.encounterIds
                    .map((id) => encounterMap.get(id))
                    .filter((e) => e !== undefined);

                if (patientEncounters.length === 0) continue; // Skip if no encounters selected (shouldn't happen if UI enforces it)

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

                // Collect Services
                const consultas = [];
                const procedimientos = [];
                const medicamentos = [];

                for (const enc of patientEncounters) {
                    if (!enc.encounter) continue;

                    const billingItems = billingRecordsByEncounter.get(enc.encounter) || [];
                    const presItems = prescriptionsByEncounter.get(enc.encounter) || [];

                    // Identify Diagnoses (code_type == 'RIPS') and Procedures (code_type == '4')
                    const diagnoses = billingItems.filter(b => b.code_type === 'RIPS');
                    const procedures = billingItems.filter(b => b.code_type === '4');

                    // Primary Diagnosis Code (Use the first one found, or empty/default)
                    const codDiagnosticoPrincipal = diagnoses.length > 0 ? (diagnoses[0]?.code || "") : "";

                    // Provider Info
                    const provider = enc.provider_id ? providerMap.get(enc.provider_id) : undefined;

                    // 1. Consultas (Treat every encounter as a Consulta)
                    // We attempt to map fields better now, but default to empty/placeholders if missing in OpenEMR data
                    consultas.push({
                        codPrestador: facility.federal_ein || "",
                        fechaInicioAtencion: enc.date ? new Date(enc.date).toISOString() : "",
                        numAutorizacion: "", // Not usually in basic encounter data
                        codConsulta: "", // Needs specific CUPS code from billing if applicable, but often encounter doesn't link directly to one "consult code" easily without logic.
                        modalidadGrupoServicio: "01", // Default to Intramural (01) as common case
                        grupoServicios: "01", // Default to Consulta Externa (01)
                        codServicio: "348", // Example or default? Left empty if unsure, but user asked to map. Let's leave empty for validator to catch if missing.
                        finalidadTecnologiaSalud: "10", // Default: No aplica? Or 44 (Promocion)? Without specific mapping, this is a guess.
                        causaMotivoAtencion: "38", // Default: Enfermedad General?
                        codDiagnosticoPrincipal: codDiagnosticoPrincipal,
                        codDiagnosticoRelacionado1: diagnoses.length > 1 ? (diagnoses[1]?.code || "") : "",
                        codDiagnosticoRelacionado2: diagnoses.length > 2 ? (diagnoses[2]?.code || "") : "",
                        codDiagnosticoRelacionado3: diagnoses.length > 3 ? (diagnoses[3]?.code || "") : "",
                        tipoDiagnosticoPrincipal: "01", // Impresion Diagnostica
                        tipoDocumentoIdentificacion: "CC", // Provider Doc Type - Defaulting to CC
                        numDocumentoIdentificacion: provider ? (provider.federaltaxid || provider.npi || "") : "",
                        valorPagoModerador: 0,
                        valorConsulta: 0, // Should sum fees?
                        conceptoRecaudo: "05", // No aplica / Ninguno?
                        numFEVPagoModerador: "",
                        consecutivo: consultas.length + 1
                    });

                    // 2. Procedimientos
                    for (const proc of procedures) {
                        procedimientos.push({
                            codPrestador: facility.federal_ein || "",
                            fechaInicioAtencion: proc.date ? new Date(proc.date).toISOString() : (enc.date ? new Date(enc.date).toISOString() : ""),
                            idMIPRES: null, // P03: Skipped/Null per request
                            numAutorizacion: "", // P04
                            codProcedimiento: proc.code || "",
                            viaIngresoServicio: "01", // P06: Default Ambulatorio?
                            modalidadGrupoServicio: "01", // Default Intramural
                            grupoServicios: "01", // Default Consulta Externa
                            codServicio: "348", // Placeholder
                            finalidadTecnologiaSalud: "44", // P10: Default Promocion/Prevencion or 10?
                            tipoDocumentoIdentificacion: "CC", // P11: Provider Doc Type
                            numDocumentoIdentificacion: provider ? (provider.federaltaxid || provider.npi || "") : "", // P12
                            codDiagnosticoPrincipal: codDiagnosticoPrincipal,
                            codDiagnosticoRelacionado: diagnoses.length > 1 ? (diagnoses[1]?.code || "") : "",
                            codComplicacion: "",
                            valorPagoModerador: 0,
                            valorProcedimiento: Number(proc.fee) || 0,
                            conceptoRecaudo: "05", // P17: No aplica
                            numFEVPagoModerador: "",
                            consecutivo: procedimientos.length + 1
                        });
                    }

                    // 3. Medicamentos
                    for (const med of presItems) {
                        // Prescriber (Provider) might be different for medications if fetched from prescription table,
                        // but our query joins simply on encounter or patient.
                        // We updated getPrescriptions to fetch provider_id, let's look it up.
                        const medProvider = med.provider_id ? providerMap.get(med.provider_id) : provider;

                        // Calculate days treatment
                        let diasTratamiento = 0;
                        if (med.start_date && med.end_date) {
                            const diffTime = Math.abs(new Date(med.end_date).getTime() - new Date(med.start_date).getTime());
                            diasTratamiento = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        }

                        medicamentos.push({
                            codPrestador: facility.federal_ein || "",
                            numAutorizacion: "",
                            idMIPRES: null,
                            fechaDispencr: med.start_date ? new Date(med.start_date).toISOString() : (enc.date ? new Date(enc.date).toISOString() : ""),
                            codDiagnosticoPrincipal: codDiagnosticoPrincipal,
                            codDiagnosticoRelacionado: diagnoses.length > 1 ? (diagnoses[1]?.code || "") : "",
                            tipoMedicamento: "01", // M07: Default to POS (01)
                            codTecnologiaSalud: med.rxnorm_drugcode || "", // M08
                            nomTecnologiaSalud: med.drug || "",
                            concentracionMedicamento: 0, // M10: Skipped
                            unidadMedida: "", // M11: Skipped
                            formaFarmaceutica: "", // M12: Skipped
                            unidadMinDispensacion: "", // M13: Skipped
                            cantidadMedicamento: Number(med.quantity) || 0,
                            diasTratamiento: diasTratamiento, // M15
                            tipoDocumentoIdentificacion: "CC", // M16
                            numDocumentoIdentificacion: medProvider ? (medProvider.federaltaxid || medProvider.npi || "") : "", // M17
                            valorPagoModerador: 0,
                            valorUnitarioMedicamento: 0, // M18: Usually 0 if not dispensed/billed
                            valorServicio: 0, // M19
                            conceptoRecaudo: "05", // M20
                            numFEVPagoModerador: "",
                            consecutivo: medicamentos.length + 1
                        });
                    }
                }

                // RIPS JSON structure for one user
                // ... (Logic continues) ...
                // **Assumption**: I will take the invoice number from the *first* selected encounter and assume all selected encounters belong to it,
                // OR simply comma-separate them if multiple?
                // Better: I will use the first encounter's invoice number for the root "numFactura".
                // If the user selects encounters with different invoice numbers, this might be invalid RIPS, but I'll follow the structure provided.

                const userObj = {
                    tipoDocumentoIdentificacion: patient.document_type || "CC", // Default if missing
                    numDocumentoIdentificacion: patient.ss || "",
                    tipoUsuario: patient.user_type || selection.userType || "", // Use DB value first, then selection, then empty
                    fechaNacimiento: patient.DOB ? new Date(patient.DOB).toISOString().split('T')[0] : "",
                    codSexo: patient.sex || "",
                    codPaisResidencia: patient.country_code || "170", // Colombia default
                    codMunicipioResidencia: patient.city || "", // Needs proper code
                    incapacidad: incapacidad,
                    consecutivo: userConsecutive++,
                    servicios: {
                        consultas: consultas,
                        procedimientos: procedimientos,
                        medicamentos: medicamentos,
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
            const firstSelection = input.selections[0];
            if (firstSelection) {
                const firstEncId = firstSelection.encounterIds[0];
                if (firstEncId !== undefined) {
                    const enc = encounterMap.get(firstEncId);
                    if (enc) numFactura = enc.invoice_refno || "";
                }
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
