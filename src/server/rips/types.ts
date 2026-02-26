export interface RipsConsultation {
    codPrestador: string;
    fechaInicioAtencion: string;
    numAutorizacion: string;
    codConsulta: string;
    modalidadGrupoServicio: string;
    grupoServicios: string;
    codServicio: string;
    finalidadTecnologiaSalud: string;
    causaMotivoAtencion: string;
    codDiagnosticoPrincipal: string;
    codDiagnosticoRelacionado1: string;
    codDiagnosticoRelacionado2: string;
    codDiagnosticoRelacionado3: string;
    tipoDiagnosticoPrincipal: string;
    tipoDocumentoIdentificacion: string;
    numDocumentoIdentificacion: string;
    valorPagoModerador: number;
    valorConsulta: number;
    conceptoRecaudo: string;
    numFEVPagoModerador: string;
    consecutivo: number;
}

export interface RipsProcedure {
    codPrestador: string;
    fechaInicioAtencion: string;
    idMIPRES: string | null;
    numAutorizacion: string;
    codProcedimiento: string;
    viaIngresoServicio: string;
    modalidadGrupoServicio: string;
    grupoServicios: string;
    codServicio: string;
    finalidadTecnologiaSalud: string;
    tipoDocumentoIdentificacion: string;
    numDocumentoIdentificacion: string;
    codDiagnosticoPrincipal: string;
    codDiagnosticoRelacionado: string;
    codComplicacion: string;
    valorPagoModerador: number;
    valorProcedimiento: number;
    conceptoRecaudo: string;
    numFEVPagoModerador: string;
    consecutivo: number;
}

export interface RipsMedication {
    codPrestador: string;
    numAutorizacion: string;
    idMIPRES: string | null;
    fechaDispencr: string;
    codDiagnosticoPrincipal: string;
    codDiagnosticoRelacionado: string;
    tipoMedicamento: string;
    codTecnologiaSalud: string;
    nomTecnologiaSalud: string;
    concentracionMedicamento: number;
    unidadMedida: string;
    formaFarmaceutica: string;
    unidadMinDispensacion: string;
    cantidadMedicamento: number;
    diasTratamiento: number;
    tipoDocumentoIdentificacion: string;
    numDocumentoIdentificacion: string;
    valorPagoModerador: number;
    valorUnitarioMedicamento: number;
    valorServicio: number;
    conceptoRecaudo: string;
    numFEVPagoModerador: string;
    consecutivo: number;
}

export interface RipsServices {
    consultas: RipsConsultation[];
    procedimientos: RipsProcedure[];
    medicamentos: RipsMedication[];
    urgencias: any[]; // Placeholder
    hospitalizacion: any[]; // Placeholder
    recienNacidos: any[]; // Placeholder
    otrosServicios: any[]; // Placeholder
}

export interface RipsUser {
    tipoDocumentoIdentificacion: string;
    numDocumentoIdentificacion: string;
    tipoUsuario: string;
    fechaNacimiento: string;
    codSexo: string;
    codPaisResidencia: string;
    codMunicipioResidencia: string;
    incapacidad: string;
    consecutivo: number;
    servicios: RipsServices;
    // Helper fields for validation context, not part of final JSON but useful?
    // Usually we keep the JSON pure.
}

export interface RipsTransaction {
    numDocumentoIdObligado: string;
    numFactura: string | null;
    tipoNota: string | null;
    numNota: string | null;
    usuarios: RipsUser[];
}

export interface RipsJson {
    transaccion: RipsTransaction;
}
