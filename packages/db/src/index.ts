import { eq, sql } from "drizzle-orm";
import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export { siteVisits } from "./schema";
export type { DrizzleD1Database };

export function getDb(d1: D1Database): DrizzleD1Database<typeof schema> {
	return drizzle(d1, { schema });
}

const SINGLETON_ID = 1;

/**
 * Atomically increment the global visit counter and return the new total.
 * Uses SQLite `ON CONFLICT` so concurrent requests stay consistent.
 */
export async function incrementSiteVisits(d1: D1Database): Promise<number> {
	const db = getDb(d1);
	await db
		.insert(schema.siteVisits)
		.values({ id: SINGLETON_ID, total: 1 })
		.onConflictDoUpdate({
			target: schema.siteVisits.id,
			set: { total: sql`${schema.siteVisits.total} + 1` },
		});
	const row = await db
		.select({ total: schema.siteVisits.total })
		.from(schema.siteVisits)
		.where(eq(schema.siteVisits.id, SINGLETON_ID))
		.get();
	return row?.total ?? 1;
}
