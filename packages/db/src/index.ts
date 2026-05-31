import { desc, eq, sql } from "drizzle-orm";
import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export { chatRooms, siteVisits } from "./schema";
export type { DrizzleD1Database };

export type ChatRoomRow = {
	id: string;
	createdAt: Date;
	lastActiveAt: Date;
};

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

/** Upsert a chat room id when a room is first visited or re-used. */
export async function registerChatRoom(d1: D1Database, roomId: string): Promise<void> {
	const db = getDb(d1);
	const now = new Date();
	await db
		.insert(schema.chatRooms)
		.values({ id: roomId, createdAt: now, lastActiveAt: now })
		.onConflictDoUpdate({
			target: schema.chatRooms.id,
			set: { lastActiveAt: now },
		});
}

/** List registered chat rooms for admin (newest activity first). */
export async function listChatRooms(
	d1: D1Database,
	options: { limit?: number; offset?: number } = {},
): Promise<{ rooms: ChatRoomRow[]; total: number }> {
	const db = getDb(d1);
	const limit = Math.min(500, Math.max(1, options.limit ?? 100));
	const offset = Math.max(0, options.offset ?? 0);
	const [rooms, countRow] = await Promise.all([
		db
			.select()
			.from(schema.chatRooms)
			.orderBy(desc(schema.chatRooms.lastActiveAt))
			.limit(limit)
			.offset(offset),
		db.select({ total: sql<number>`count(*)` }).from(schema.chatRooms).get(),
	]);
	return {
		rooms: rooms.map((r) => ({
			id: r.id,
			createdAt: r.createdAt,
			lastActiveAt: r.lastActiveAt,
		})),
		total: countRow?.total ?? 0,
	};
}
