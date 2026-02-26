import { z } from "zod";

export interface ValidationError {
  scope: string; // e.g., "Transaction", "User 1 (CC 12345)", "Consultation 1"
  field: string;
  message: string;
  value: any;
  severity: "error" | "warning"; // Requirement says "validation fails but JSON is generated", usually implies errors that should be fixed but don't block generation.
}

// Helper to calculate age
function calculateAge(dobStr: string, referenceDate: Date = new Date()): number {
  if (!dobStr) return -1;
  const dob = new Date(dobStr);
  const diff = referenceDate.getTime() - dob.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
}

// Reference Tables (simplified or mocked based on requirements)
const VALID_DOCUMENT_TYPES = ["CC", "CE", "CD", "PA", "SC", "PE", "RC", "TI", "CN", "AS", "MS", "DE", "SI", "PT"];
const VALID_USER_TYPES = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13"];
const VALID_SEX_CODES = ["M", "F", "I"];
const VALID_MODALITIES = ["01", "02", "03", "04", "06", "07", "08", "09"];
const VALID_SERVICE_GROUPS = ["01", "02", "03", "04", "05"];
const VALID_CAUSES = ["21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "38"]; // 38 added as generic fallback often used
const VALID_DIAG_TYPES = ["01", "02", "03"];
const VALID_CONCEPTO_RECAUDO = ["01", "02", "03", "04", "05"]; // Generic set based on typical RIPS

// Length constraints
const DOC_LENGTHS: Record<string, { min?: number; max: number; fixed?: number }> = {
  CC: { max: 10 },
  CE: { max: 6 },
  CD: { max: 16 },
  PA: { max: 16 },
  SC: { max: 16 },
  PE: { max: 15 },
  RC: { max: 11 },
  TI: { max: 11 },
  CN: { min: 9, max: 20 },
  AS: { max: 10 },
  MS: { max: 12 },
  DE: { max: 20 },
  PT: { max: 20 },
  SI: { max: 20 },
};

export function validateRipsJson(json: any): ValidationError[] {
  const errors: ValidationError[] = [];

  // 1. Transaction Validation (CT)
  const trans = json.transaccion;
  if (!trans) {
    errors.push({ scope: "Structure", field: "transaccion", message: "Missing transaction object", value: null, severity: "error" });
    return errors;
  }

  // T01: numDocumentoIdObligado (4-12 chars)
  const t01 = trans.numDocumentoIdObligado;
  if (!t01 || t01.length < 4 || t01.length > 12) {
    errors.push({ scope: "Transaction", field: "numDocumentoIdObligado", message: "Must be between 4 and 12 characters", value: t01, severity: "error" });
  }

  // T02: numFactura (String, can be null for specific cases, but we validate strictly if present)
  // Requirement: "permite informar null... para envío sin FEV". strict check on types.
  if (trans.numFactura !== null && typeof trans.numFactura !== "string") {
     errors.push({ scope: "Transaction", field: "numFactura", message: "Must be a string or null", value: trans.numFactura, severity: "error" });
  }

  // T03: tipoNota (0-2 chars)
  // Logic: NC, ND, NA, RS (for no FEV)
  const t03 = trans.tipoNota;
  if (t03 !== null) {
      if (typeof t03 !== "string" || t03.length > 2) {
          errors.push({ scope: "Transaction", field: "tipoNota", message: "Must be a string max 2 chars or null", value: t03, severity: "error" });
      }
      // If numFactura is null/empty (implying No FEV), tipoNota should likely be RS
      if (!trans.numFactura && t03 !== "RS") {
          // Warning or Error? "debe diligenciarse con RS"
          errors.push({ scope: "Transaction", field: "tipoNota", message: "For RIPS without FEV (no invoice number), tipoNota should be 'RS'", value: t03, severity: "warning" });
      }
  }

  // Users Validation
  if (!Array.isArray(trans.usuarios)) {
      errors.push({ scope: "Transaction", field: "usuarios", message: "Must be an array", value: trans.usuarios, severity: "error" });
      return errors;
  }

  trans.usuarios.forEach((user: any, index: number) => {
      const scope = `User ${user.consecutivo || index + 1} (${user.tipoDocumentoIdentificacion} ${user.numDocumentoIdentificacion})`;

      // U01: Type
      if (!VALID_DOCUMENT_TYPES.includes(user.tipoDocumentoIdentificacion)) {
          errors.push({ scope, field: "tipoDocumentoIdentificacion", message: "Invalid Document Type", value: user.tipoDocumentoIdentificacion, severity: "error" });
      }

      // U02: Number
      const docNum = user.numDocumentoIdentificacion;
      const docType = user.tipoDocumentoIdentificacion;

      if (!docNum) {
          errors.push({ scope, field: "numDocumentoIdentificacion", message: "Missing Document Number", value: docNum, severity: "error" });
      } else {
          // Numeric check for CC, TI
          if ((docType === "CC" || docType === "TI") && !/^\d+$/.test(docNum)) {
               errors.push({ scope, field: "numDocumentoIdentificacion", message: "Must differ contain only numbers for CC/TI", value: docNum, severity: "error" });
          }

          // Length check
          const rules = DOC_LENGTHS[docType];
          if (rules) {
              if (rules.max && docNum.length > rules.max) {
                  errors.push({ scope, field: "numDocumentoIdentificacion", message: `Max length exceeded (Max: ${rules.max})`, value: docNum, severity: "error" });
              }
              if (rules.min && docNum.length < rules.min) {
                  errors.push({ scope, field: "numDocumentoIdentificacion", message: `Min length not met (Min: ${rules.min})`, value: docNum, severity: "error" });
              }
          }
      }

      // Age Logic
      const dob = user.fechaNacimiento;
      const age = calculateAge(dob);

      if (age === -1) {
          errors.push({ scope, field: "fechaNacimiento", message: "Invalid or missing Date of Birth", value: dob, severity: "error" });
      } else {
          // Age vs Doc Type Validation (Strict + Tolerance)
          // Rules:
          // >= 18: CC. Tolerance: TI allowed < 19.
          // 7-17: TI. Tolerance: RC allowed < 8.
          // 0-6: RC.
          // 0-3: RC or CN.
          // Exceptions: Foreigners (CE, CD, PA, SC, PE, DE) - General rules don't strictly apply to Age the same way (except PE/PA nuances, but prompt focuses on CC/TI/RC/CN/AS/MS).
          // "Para los extranjeros de cualquier edad... CE, CD, PA, SC".
          // "Migrantes venezolanos... PE".

          const isColombian = user.codPaisResidencia === "170"; // Assuming residence = origin for strictness? Prompt says "nacionalidad colombiana" -> CC. usually inferred from doc type or specific field not present in JSON (nationality). We'll assume standard flow.

          // CC
          if (docType === "CC") {
              if (age < 18) {
                   errors.push({ scope, field: "tipoDocumentoIdentificacion", message: "CC is for >= 18 years old", value: `Age: ${age}, Type: ${docType}`, severity: "error" });
              }
          }
          // TI
          else if (docType === "TI") {
              // Range: 7 - 17.
              // Tolerance: < 19 is allowed (18 year olds can have TI).
              if (age < 7) {
                  errors.push({ scope, field: "tipoDocumentoIdentificacion", message: "TI is for >= 7 years old", value: `Age: ${age}, Type: ${docType}`, severity: "error" });
              }
              if (age >= 19) {
                  errors.push({ scope, field: "tipoDocumentoIdentificacion", message: "TI is invalid for >= 19 years old", value: `Age: ${age}, Type: ${docType}`, severity: "error" });
              }
          }
          // RC
          else if (docType === "RC") {
              // Range: 0 - 6.
              // Tolerance: < 8 is allowed (7 year olds can have RC).
              if (age >= 8) {
                  errors.push({ scope, field: "tipoDocumentoIdentificacion", message: "RC is invalid for >= 8 years old", value: `Age: ${age}, Type: ${docType}`, severity: "error" });
              }
          }
          // CN
          else if (docType === "CN") {
              // Range: 0 - 3.
              // Tolerance not explicitly defined as "1 year" for CN->RC, but "Menores de hasta 3 años... RC o CN".
              // Usually CN is for newborns.
              if (age > 3) {
                  errors.push({ scope, field: "tipoDocumentoIdentificacion", message: "CN is for <= 3 years old", value: `Age: ${age}, Type: ${docType}`, severity: "error" });
              }
          }
          // AS (Adult without ID)
          else if (docType === "AS") {
              if (age <= 18) {
                  errors.push({ scope, field: "tipoDocumentoIdentificacion", message: "AS is for > 18 years old", value: `Age: ${age}, Type: ${docType}`, severity: "error" });
              }
          }
          // MS (Minor without ID)
          else if (docType === "MS") {
               if (age > 18) {
                  errors.push({ scope, field: "tipoDocumentoIdentificacion", message: "MS is for minors (<= 18)", value: `Age: ${age}, Type: ${docType}`, severity: "error" });
               }
          }
      }

      // U03: User Type
      if (!VALID_USER_TYPES.includes(user.tipoUsuario)) {
           errors.push({ scope, field: "tipoUsuario", message: "Invalid User Type", value: user.tipoUsuario, severity: "error" });
      }

      // U05: Sex
      if (!VALID_SEX_CODES.includes(user.codSexo)) {
          errors.push({ scope, field: "codSexo", message: "Invalid Sex Code", value: user.codSexo, severity: "error" });
      }

      // U07: Municipality
      // "Validar para informar obligatorio el municipio cuando el país de residencia es Colombia"
      if (user.codPaisResidencia === "170") {
          if (!user.codMunicipioResidencia) {
               errors.push({ scope, field: "codMunicipioResidencia", message: "Municipality required for Colombia", value: user.codMunicipioResidencia, severity: "error" });
          } else if (user.codMunicipioResidencia.length !== 5) {
               errors.push({ scope, field: "codMunicipioResidencia", message: "Municipality code must be 5 characters", value: user.codMunicipioResidencia, severity: "error" });
          }
      }

      // U09: Incapacidad
      if (!["SI", "NO"].includes(user.incapacidad)) {
           errors.push({ scope, field: "incapacidad", message: "Must be SI or NO", value: user.incapacidad, severity: "error" });
      }

      // Services Validation (Deep dive into arrays)
      if (user.servicios) {
          validateServices(user.servicios, scope, errors);
      }
  });

  return errors;
}

function validateServices(servicios: any, userScope: string, errors: ValidationError[]) {
    // 1. Consultas
    if (Array.isArray(servicios.consultas)) {
        servicios.consultas.forEach((c: any, i: number) => {
            const scope = `${userScope} > Consulta ${c.consecutivo || i + 1}`;

            // C01: Provider Code - 12 chars
            if (!c.codPrestador) {
                errors.push({ scope, field: "codPrestador", message: "Required", value: null, severity: "error" });
            } else if (c.codPrestador.length !== 12) {
                // User requirement: "identifica al prestador... en el RIPS se debe registrar con 12 caracteres"
                errors.push({ scope, field: "codPrestador", message: "Must be exactly 12 characters", value: c.codPrestador, severity: "error" });
            }

            // C02: Start Date
            if (!c.fechaInicioAtencion) {
                errors.push({ scope, field: "fechaInicioAtencion", message: "Required", value: null, severity: "error" });
            } else if (isNaN(Date.parse(c.fechaInicioAtencion))) {
                errors.push({ scope, field: "fechaInicioAtencion", message: "Invalid Date Format", value: c.fechaInicioAtencion, severity: "error" });
            }

            // C03: CUPS Code (Basic check, usually 6 chars)
            if (!c.codConsulta) {
                 errors.push({ scope, field: "codConsulta", message: "Required", value: null, severity: "error" });
            }

            // C05: Modality
            if (!VALID_MODALITIES.includes(c.modalidadGrupoServicio)) {
                errors.push({ scope, field: "modalidadGrupoServicio", message: "Invalid Modality Code", value: c.modalidadGrupoServicio, severity: "error" });
            }

            // C06: Service Group
            if (!VALID_SERVICE_GROUPS.includes(c.grupoServicios)) {
                errors.push({ scope, field: "grupoServicios", message: "Invalid Service Group Code", value: c.grupoServicios, severity: "error" });
            }

            // C08: Purpose (Finalidad) - Basic presence check
            if (!c.finalidadTecnologiaSalud) {
                errors.push({ scope, field: "finalidadTecnologiaSalud", message: "Required", value: null, severity: "error" });
            }

            // C09: Cause
            if (!VALID_CAUSES.includes(c.causaMotivoAtencion)) {
                 errors.push({ scope, field: "causaMotivoAtencion", message: "Invalid Cause Code", value: c.causaMotivoAtencion, severity: "error" });
            }

            // C10: Diagnosis
            if (!c.codDiagnosticoPrincipal) {
                errors.push({ scope, field: "codDiagnosticoPrincipal", message: "Required", value: null, severity: "error" });
            }

            // C14: Diagnosis Type
            if (!VALID_DIAG_TYPES.includes(c.tipoDiagnosticoPrincipal)) {
                 errors.push({ scope, field: "tipoDiagnosticoPrincipal", message: "Invalid Diagnosis Type", value: c.tipoDiagnosticoPrincipal, severity: "error" });
            }

            // C17, C18, C19: Payment fields (Numeric)
            if (c.valorPagoModerador < 0) errors.push({ scope, field: "valorPagoModerador", message: "Cannot be negative", value: c.valorPagoModerador, severity: "error" });
            if (c.valorConsulta < 0) errors.push({ scope, field: "valorConsulta", message: "Cannot be negative", value: c.valorConsulta, severity: "error" });

            // C18: Concepto Recaudo
            if (!VALID_CONCEPTO_RECAUDO.includes(c.conceptoRecaudo)) {
                 errors.push({ scope, field: "conceptoRecaudo", message: "Invalid Concepto Recaudo", value: c.conceptoRecaudo, severity: "error" });
            }
        });
    }

    // 2. Procedimientos
    if (Array.isArray(servicios.procedimientos)) {
        servicios.procedimientos.forEach((p: any, i: number) => {
            const scope = `${userScope} > Procedimiento ${p.consecutivo || i + 1}`;

            // P01: Provider Code - 12 chars
            if (!p.codPrestador) {
                errors.push({ scope, field: "codPrestador", message: "Required", value: null, severity: "error" });
            } else if (p.codPrestador.length !== 12) {
                errors.push({ scope, field: "codPrestador", message: "Must be exactly 12 characters", value: p.codPrestador, severity: "error" });
            }

            // P02: Date
            if (!p.fechaInicioAtencion || isNaN(Date.parse(p.fechaInicioAtencion))) {
                errors.push({ scope, field: "fechaInicioAtencion", message: "Invalid Date Format", value: p.fechaInicioAtencion, severity: "error" });
            }

            // P05: CUPS Code
            if (!p.codProcedimiento) {
                 errors.push({ scope, field: "codProcedimiento", message: "Required", value: null, severity: "error" });
            }

            // P06: Via Ingreso (Simple check against basic expected list if needed, or just presence)
            if (!["01", "02", "03", "04"].includes(p.viaIngresoServicio)) {
                 errors.push({ scope, field: "viaIngresoServicio", message: "Invalid Via Ingreso Code", value: p.viaIngresoServicio, severity: "error" });
            }

            // P10: Finalidad
            if (!p.finalidadTecnologiaSalud) {
                errors.push({ scope, field: "finalidadTecnologiaSalud", message: "Required", value: null, severity: "error" });
            }

            // P16: Value (Must be > 1 if event based, typically > 0)
            if (p.valorProcedimiento < 0) {
                 errors.push({ scope, field: "valorProcedimiento", message: "Cannot be negative", value: p.valorProcedimiento, severity: "error" });
            }

            // P17: Concepto Recaudo
            if (!VALID_CONCEPTO_RECAUDO.includes(p.conceptoRecaudo)) {
                 errors.push({ scope, field: "conceptoRecaudo", message: "Invalid Concepto Recaudo", value: p.conceptoRecaudo, severity: "error" });
            }
        });
    }

    // 3. Medicamentos
    if (Array.isArray(servicios.medicamentos)) {
        servicios.medicamentos.forEach((m: any, i: number) => {
             const scope = `${userScope} > Medicamento ${m.consecutivo || i + 1}`;

             // M01: Provider Code - 12 chars
            if (!m.codPrestador) {
                errors.push({ scope, field: "codPrestador", message: "Required", value: null, severity: "error" });
            } else if (m.codPrestador.length !== 12) {
                errors.push({ scope, field: "codPrestador", message: "Must be exactly 12 characters", value: m.codPrestador, severity: "error" });
            }

            // M04: Date
            if (!m.fechaDispencr || isNaN(Date.parse(m.fechaDispencr))) {
                errors.push({ scope, field: "fechaDispencr", message: "Invalid Date Format", value: m.fechaDispencr, severity: "error" });
            }

            // M05: Diagnosis
            if (!m.codDiagnosticoPrincipal) {
                errors.push({ scope, field: "codDiagnosticoPrincipal", message: "Required", value: null, severity: "error" });
            }

            // M07: Type (Usually 01-POS)
            if (!m.tipoMedicamento) {
                errors.push({ scope, field: "tipoMedicamento", message: "Required", value: null, severity: "error" });
            }

             if (!m.codTecnologiaSalud) errors.push({ scope, field: "codTecnologiaSalud", message: "Required", value: null, severity: "error" });
             if (!m.nomTecnologiaSalud) errors.push({ scope, field: "nomTecnologiaSalud", message: "Required", value: null, severity: "error" });

             // M15: Days Treatment (integer, max 3 chars -> < 1000)
             if (m.diasTratamiento < 0 || m.diasTratamiento > 999 || !Number.isInteger(m.diasTratamiento)) {
                  errors.push({ scope, field: "diasTratamiento", message: "Invalid Days (0-999)", value: m.diasTratamiento, severity: "error" });
             }

             // M18/M19: Value
             if (m.valorUnitarioMedicamento < 0) errors.push({ scope, field: "valorUnitarioMedicamento", message: "Cannot be negative", value: m.valorUnitarioMedicamento, severity: "error" });
             if (m.valorServicio < 0) errors.push({ scope, field: "valorServicio", message: "Cannot be negative", value: m.valorServicio, severity: "error" });

             // M20: Concepto Recaudo
            if (!VALID_CONCEPTO_RECAUDO.includes(m.conceptoRecaudo)) {
                 errors.push({ scope, field: "conceptoRecaudo", message: "Invalid Concepto Recaudo", value: m.conceptoRecaudo, severity: "error" });
            }
        });
    }
}
