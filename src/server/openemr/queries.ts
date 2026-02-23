import type { Insertable, Updateable } from "kysely";
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
