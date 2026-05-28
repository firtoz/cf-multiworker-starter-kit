import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export * from "./schema";

export type AuthDb = DrizzleD1Database<typeof schema>;

export function getAuthDb(binding: D1Database): AuthDb {
	return drizzle(binding, { schema });
}
