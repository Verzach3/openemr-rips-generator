import { os } from "@orpc/server";
import { z } from "zod";
import { searchPatients, getEncountersForPatients, getPatientsRipsData, getFacilityById, getFacilities, getBillingOptionsByEncounterIds, getBillingRecords, getPrescriptions } from "./openemr/queries";
import { getRipUserTypes, createRipsGenerationRecord, ensureRipsIncapacidadOptions, getRipIncapacidades } from "./rips-helper";

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
            for (const selection of input.selections) {
                for (const encId of selection.encounterIds) {
                    const enc = encounterMap.get(encId);
                    if (enc && enc.encounter) {
                        allEncounterNumbers.push(enc.encounter);
                    }
                }
            }

            // Parallel fetch for billing options, records, and prescriptions
            const [billingOptions, billingRecords, prescriptionRecords] = await Promise.all([
                getBillingOptionsByEncounterIds(allEncounterNumbers),
                getBillingRecords(allEncounterNumbers),
                getPrescriptions(allEncounterNumbers)
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
                    const codDiagnosticoPrincipal = diagnoses.length > 0 ? diagnoses[0].code : "";

                    // 1. Consultas (Treat every encounter as a Consulta)
                    // Note: Missing fields are placeholders as per instructions "skip those"
                    consultas.push({
                        codPrestador: facility.federal_ein || "", // Assuming facility ID is used here
                        fechaInicioAtencion: enc.date ? new Date(enc.date).toISOString() : "",
                        numAutorizacion: "", // Missing
                        codConsulta: "", // Missing CUPS code for the consultation itself
                        modalidadGrupoServicio: "", // Missing
                        grupoServicios: "", // Missing
                        codServicio: "", // Missing
                        finalidadTecnologiaSalud: "", // Missing
                        causaMotivoAtencion: "", // Missing
                        codDiagnosticoPrincipal: codDiagnosticoPrincipal,
                        codDiagnosticoRelacionado1: diagnoses.length > 1 ? diagnoses[1].code : "",
                        codDiagnosticoRelacionado2: diagnoses.length > 2 ? diagnoses[2].code : "",
                        codDiagnosticoRelacionado3: diagnoses.length > 3 ? diagnoses[3].code : "",
                        tipoDiagnosticoPrincipal: "", // Missing
                        valorPagoModerador: 0, // Placeholder
                        valorConsulta: 0, // Placeholder
                        conceptoRecaudo: "", // Missing
                        numFEVPagoModerador: "", // Missing
                        consecutivo: consultas.length + 1
                    });

                    // 2. Procedimientos
                    for (const proc of procedures) {
                        procedimientos.push({
                            codPrestador: facility.federal_ein || "",
                            fechaInicioAtencion: proc.date ? new Date(proc.date).toISOString() : (enc.date ? new Date(enc.date).toISOString() : ""),
                            idMIPRES: "", // Missing
                            numAutorizacion: "", // Missing
                            codProcedimiento: proc.code || "",
                            viaIngresoServicio: "", // Missing
                            modalidadGrupoServicio: "", // Missing
                            grupoServicios: "", // Missing
                            codServicio: "", // Missing
                            finalidadTecnologiaSalud: "", // Missing
                            tipoDocumentoIdentificacion: patient.document_type || "CC",
                            numDocumentoIdentificacion: patient.ss || "",
                            codDiagnosticoPrincipal: codDiagnosticoPrincipal,
                            codDiagnosticoRelacionado: diagnoses.length > 1 ? diagnoses[1].code : "",
                            codComplicacion: "", // Missing
                            valorPagoModerador: 0,
                            valorProcedimiento: Number(proc.fee) || 0,
                            conceptoRecaudo: "", // Missing
                            numFEVPagoModerador: "", // Missing
                            consecutivo: procedimientos.length + 1
                        });
                    }

                    // 3. Medicamentos
                    for (const med of presItems) {
                        medicamentos.push({
                            codPrestador: facility.federal_ein || "",
                            numAutorizacion: "", // Missing
                            idMIPRES: "", // Missing
                            fechaDispencr: med.start_date ? new Date(med.start_date).toISOString() : (enc.date ? new Date(enc.date).toISOString() : ""),
                            codDiagnosticoPrincipal: codDiagnosticoPrincipal,
                            codDiagnosticoRelacionado: diagnoses.length > 1 ? diagnoses[1].code : "",
                            tipoMedicamento: "", // Missing
                            codTecnologiaSalud: med.rxnorm_drugcode || "",
                            nomTecnologiaSalud: med.drug || "",
                            concentracionMedicamento: 0, // Missing
                            unidadMedida: "", // Missing
                            formaFarmaceutica: "", // Missing
                            unidadMinDispensacion: "", // Missing
                            cantidadMedicamento: Number(med.quantity) || 0,
                            diasTratamiento: 0, // Missing
                            tipoDocumentoIdentificacion: patient.document_type || "CC",
                            numDocumentoIdentificacion: patient.ss || "",
                            valorPagoModerador: 0,
                            valorUnitarioMedicamento: 0, // Missing
                            valorServicio: 0, // Missing
                            conceptoRecaudo: "", // Missing
                            numFEVPagoModerador: "", // Missing
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

            return {
                json: ripsJson,
                filename: `RIPS_${consecutivoFile}.json`,
                consecutivo: consecutivoFile
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
