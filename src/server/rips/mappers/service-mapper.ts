import type { RipsConsultation, RipsMedication, RipsProcedure } from "../types";

// Helper to find a provider by ID in a Map
function getProvider(providerId: number | null | undefined, providerMap: Map<number, any>) {
    return providerId ? providerMap.get(providerId) : undefined;
}

export function mapConsultation(
    enc: any, // Encounter
    facilityEIN: string,
    diagnoses: any[],
    providerMap: Map<number, any>,
    consecutive: number
): RipsConsultation {
    const codDiagnosticoPrincipal = diagnoses.length > 0 ? (diagnoses[0]?.code || "") : "";
    const provider = getProvider(enc.provider_id, providerMap);

    return {
        codPrestador: facilityEIN || "",
        fechaInicioAtencion: enc.date ? new Date(enc.date).toISOString() : "",
        numAutorizacion: "",
        codConsulta: "",
        modalidadGrupoServicio: "01",
        grupoServicios: "01",
        codServicio: "348",
        finalidadTecnologiaSalud: "10",
        causaMotivoAtencion: "38",
        codDiagnosticoPrincipal: codDiagnosticoPrincipal,
        codDiagnosticoRelacionado1: diagnoses.length > 1 ? (diagnoses[1]?.code || "") : "",
        codDiagnosticoRelacionado2: diagnoses.length > 2 ? (diagnoses[2]?.code || "") : "",
        codDiagnosticoRelacionado3: diagnoses.length > 3 ? (diagnoses[3]?.code || "") : "",
        tipoDiagnosticoPrincipal: "01",
        tipoDocumentoIdentificacion: "CC",
        numDocumentoIdentificacion: provider ? (provider.federaltaxid || provider.npi || "") : "",
        valorPagoModerador: 0,
        valorConsulta: 0,
        conceptoRecaudo: "05",
        numFEVPagoModerador: "",
        consecutivo: consecutive
    };
}

export function mapProcedure(
    proc: any, // Procedure Billing Record
    enc: any, // Encounter
    facilityEIN: string,
    diagnoses: any[],
    providerMap: Map<number, any>,
    consecutive: number
): RipsProcedure {
    const codDiagnosticoPrincipal = diagnoses.length > 0 ? (diagnoses[0]?.code || "") : "";
    const provider = getProvider(enc.provider_id, providerMap);

    return {
        codPrestador: facilityEIN || "",
        fechaInicioAtencion: proc.date ? new Date(proc.date).toISOString() : (enc.date ? new Date(enc.date).toISOString() : ""),
        idMIPRES: null,
        numAutorizacion: "",
        codProcedimiento: proc.code || "",
        viaIngresoServicio: "01",
        modalidadGrupoServicio: "01",
        grupoServicios: "01",
        codServicio: "348",
        finalidadTecnologiaSalud: "44",
        tipoDocumentoIdentificacion: "CC",
        numDocumentoIdentificacion: provider ? (provider.federaltaxid || provider.npi || "") : "",
        codDiagnosticoPrincipal: codDiagnosticoPrincipal,
        codDiagnosticoRelacionado: diagnoses.length > 1 ? (diagnoses[1]?.code || "") : "",
        codComplicacion: "",
        valorPagoModerador: 0,
        valorProcedimiento: Number(proc.fee) || 0,
        conceptoRecaudo: "05",
        numFEVPagoModerador: "",
        consecutivo: consecutive
    };
}

export function mapMedication(
    med: any, // Prescription
    enc: any, // Encounter
    facilityEIN: string,
    diagnoses: any[],
    providerMap: Map<number, any>,
    consecutive: number
): RipsMedication {
    const codDiagnosticoPrincipal = diagnoses.length > 0 ? (diagnoses[0]?.code || "") : "";

    // Look up prescriber
    // The query returns `provider_id` on the medication record (from prescriptions table)
    const medProvider = getProvider(med.provider_id, providerMap) || getProvider(enc.provider_id, providerMap);

    // Calculate days treatment
    let diasTratamiento = 0;
    if (med.start_date && med.end_date) {
        const diffTime = Math.abs(new Date(med.end_date).getTime() - new Date(med.start_date).getTime());
        diasTratamiento = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    return {
        codPrestador: facilityEIN || "",
        numAutorizacion: "",
        idMIPRES: null,
        fechaDispencr: med.start_date ? new Date(med.start_date).toISOString() : (enc.date ? new Date(enc.date).toISOString() : ""),
        codDiagnosticoPrincipal: codDiagnosticoPrincipal,
        codDiagnosticoRelacionado: diagnoses.length > 1 ? (diagnoses[1]?.code || "") : "",
        tipoMedicamento: "01",
        codTecnologiaSalud: med.rxnorm_drugcode || "",
        nomTecnologiaSalud: med.drug || "",
        concentracionMedicamento: 0,
        unidadMedida: "",
        formaFarmaceutica: "",
        unidadMinDispensacion: "",
        cantidadMedicamento: Number(med.quantity) || 0,
        diasTratamiento: diasTratamiento,
        tipoDocumentoIdentificacion: "CC",
        numDocumentoIdentificacion: medProvider ? (medProvider.federaltaxid || medProvider.npi || "") : "",
        valorPagoModerador: 0,
        valorUnitarioMedicamento: 0,
        valorServicio: 0,
        conceptoRecaudo: "05",
        numFEVPagoModerador: "",
        consecutivo: consecutive
    };
}
