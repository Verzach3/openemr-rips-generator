import type { RipsServices, RipsUser } from "../types";

export function mapUser(
    patient: any, // Typed as any for now, usually the result of getPatientsRipsData
    selectionUserType: string | undefined,
    incapacidad: string,
    consecutive: number,
    services: RipsServices
): RipsUser {
    const userType = (patient.user_type as string) || (selectionUserType as string) || "";
    const fechaNacimiento = patient.DOB ? new Date(patient.DOB).toISOString().split('T')[0] : "";

    return {
        tipoDocumentoIdentificacion: (patient.document_type as string) || "CC",
        numDocumentoIdentificacion: (patient.ss as string) || "",
        tipoUsuario: userType,
        fechaNacimiento: fechaNacimiento || "",
        codSexo: (patient.sex as string) || "",
        codPaisResidencia: (patient.country_code as string) || "170",
        codMunicipioResidencia: (patient.city as string) || "",
        incapacidad: incapacidad || "NO",
        consecutivo: consecutive,
        servicios: services
    };
}
