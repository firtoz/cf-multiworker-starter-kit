import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Single logical row: id must stay `1` (global visit counter). */
export const siteVisits = sqliteTable("site_visits", {
	id: integer("id").primaryKey(),
	total: integer("total").notNull().default(0),
});

/** Registry of chat room ids ever used (one DO instance per id). */
export const chatRooms = sqliteTable("chat_rooms", {
	id: text("id").primaryKey(),
	createdAt: integer("created_at", { mode: "timestamp_ms" })
		.notNull()
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
	lastActiveAt: integer("last_active_at", { mode: "timestamp_ms" })
		.notNull()
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
});
