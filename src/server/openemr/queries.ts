import type { Insertable, Updateable } from "kysely";
import { sql } from "kysely";
import { openemrDb } from "./db";
import type { Facility } from "kysely-codegen";

/**
 * OpenEMR Repository: safe and typed queries
 * Demonstrating how to securely query the OpenEMR mysql database.
 */

export async function getFacilityById(id: number) {
    return await openemrDb
        .selectFrom("facility")
        .where("id", "=", id)
        .selectAll()
        .executeTakeFirst();
}

export async function getFacilities() {
    return await openemrDb.selectFrom("facility").selectAll().limit(1).execute();
}

/**
 * Search facilities with dynamic criteria
 */
export async function getFacilitiesByName(name: string) {
    return await openemrDb
        .selectFrom("facility")
        .where("name", "like", `%${name}%`)
        .selectAll()
        .execute();
}

export async function updateFacility(id: number, updateWith: Updateable<Facility>) {
    return await openemrDb
        .updateTable("facility")
        .set(updateWith)
        .where("id", "=", id)
        .executeTakeFirstOrThrow();
}

/**
 * Safely create a new facility in the OpenEMR database.
 * The types check what columns are optional or generated vs required.
 */
export async function insertFacility(facility: Insertable<Facility>) {
    const result = await openemrDb
        .insertInto("facility")
        .values(facility)
        .executeTakeFirstOrThrow();

    return Number(result.insertId);
}

/**
 * Fetch patient documents inside OpenEMR securely using query builder
 */
export async function getDocumentsByForeignId(pid: number) {
    return await openemrDb
        .selectFrom("documents")
        .where("foreign_id", "=", pid) // typically pid is foreign_id
        .where("deleted", "=", 0)
        .orderBy("date", "desc")
        .selectAll()
        .execute();
}

/**
 * Query billed items per encounter securely
 */
export async function getBilledItemsByEncounter(encounterId: number) {
    return await openemrDb
        .selectFrom("billing")
        .where("encounter", "=", encounterId)
        .selectAll()
        .execute();
}

/**
 * Search patients by name or ID
 */
export async function searchPatients(term: string) {
    // basic sanitization/logic handled by kysely params
    const termLike = `%${term}%`;
    const termNum = parseInt(term, 10);

    return await openemrDb
        .selectFrom("patient_data")
        .select(["pid", "fname", "mname", "lname", "DOB", "sex", "ss", sql<string>`user_type`.as("user_type")])
        .where((eb) => {
            const conditions = [
                eb("fname", "like", termLike),
                eb("lname", "like", termLike),
                eb("mname", "like", termLike),
                eb("ss", "like", termLike),
                eb(sql<string>`CONCAT_WS(' ', fname, lname)`, "like", termLike),
                eb(sql<string>`CONCAT_WS(' ', fname, mname, lname)`, "like", termLike)
            ];
            if (!isNaN(termNum)) {
                conditions.push(eb("pid", "=", termNum));
            }
            return eb.or(conditions);
        })
        .limit(20)
        .execute();
}

/**
 * Get encounters for a list of patients, optionally filtered by date
 */
export async function getEncountersForPatients(patientIds: number[], startDate?: Date, endDate?: Date) {
    let query = openemrDb
        .selectFrom("form_encounter")
        .select(["id", "date", "encounter", "pid", "invoice_refno", "reason", "provider_id"])
        .where("pid", "in", patientIds);

    if (startDate) {
        query = query.where("date", ">=", startDate);
    }
    if (endDate) {
        query = query.where("date", "<=", endDate);
    }

    return await query.orderBy("date", "desc").execute();
}

/**
 * Get detailed patient data needed for RIPS generation
 */
export async function getPatientsRipsData(patientIds: number[]) {
    return await openemrDb
        .selectFrom("patient_data")
        .select([
            "pid",
            "fname",
            "mname",
            "lname",
            "DOB",
            "sex",
            "ss",
            "country_code",
            "city",
            // Use sql for document_type as it might not be in the generated types yet
            sql<string>`document_type`.as("document_type"),
            sql<string>`user_type`.as("user_type")
        ])
        .where("pid", "in", patientIds)
        .execute();
}

/**
 * Fetch billing options (including inability to work status) for specific encounters
 */
export async function getBillingOptionsByEncounterIds(encounterIds: number[]) {
    if (encounterIds.length === 0) return [];

    return await openemrDb
        .selectFrom("form_misc_billing_options")
        .select(["encounter", "is_unable_to_work"])
        .where("encounter", "in", encounterIds)
        .execute();
}

/**
 * Fetch provider information for a list of provider IDs
 */
export async function getProvidersByIds(providerIds: number[]) {
    if (providerIds.length === 0) return [];

    return await openemrDb
        .selectFrom("users")
        .select(["id", "username", "fname", "mname", "lname", "federaltaxid", "npi", "taxonomy"]) // Assuming federaltaxid or npi is the ID number
        .where("id", "in", providerIds)
        .execute();
}

/**
 * Fetch billing records for multiple encounters.
 */
export async function getBillingRecords(encounterIds: number[]) {
    if (encounterIds.length === 0) return [];

    return await openemrDb
        .selectFrom("billing")
        .select(["encounter", "code_type", "code", "fee", "date"])
        .where("encounter", "in", encounterIds)
        .execute();
}

/**
 * Fetch prescriptions for multiple encounters.
 */
export async function getPrescriptions(encounterIds: number[]) {
    if (encounterIds.length === 0) return [];

    return await openemrDb
        .selectFrom("prescriptions")
        .select(["encounter", "rxnorm_drugcode", "drug", "quantity", "unit", "start_date"])
        .where("encounter", "in", encounterIds)
        .execute();
}
