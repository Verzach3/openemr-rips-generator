import type { RipsTransaction, RipsUser } from "../types";

export function mapTransaction(
    facilityEIN: string,
    invoiceNumber: string,
    users: RipsUser[]
): RipsTransaction {
    return {
        numDocumentoIdObligado: facilityEIN || "",
        numFactura: invoiceNumber,
        tipoNota: null,
        numNota: null,
        usuarios: users
    };
}
