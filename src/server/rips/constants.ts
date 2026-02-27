// Reference Tables
export const VALID_DOCUMENT_TYPES = ["CC", "CE", "CD", "PA", "SC", "PE", "RC", "TI", "CN", "AS", "MS", "DE", "SI", "PT"];
export const VALID_USER_TYPES = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13"];
export const VALID_SEX_CODES = ["M", "F", "I"];
export const VALID_MODALITIES = ["01", "02", "03", "04", "06", "07", "08", "09"];
export const VALID_SERVICE_GROUPS = ["01", "02", "03", "04", "05"];
export const VALID_CAUSES = ["21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "38"]; // 38 added as generic fallback often used
export const VALID_DIAG_TYPES = ["01", "02", "03"];
export const VALID_CONCEPTO_RECAUDO = ["01", "02", "03", "04", "05"]; // Generic set based on typical RIPS

// Length constraints
export const DOC_LENGTHS: Record<string, { min?: number; max: number; fixed?: number }> = {
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
