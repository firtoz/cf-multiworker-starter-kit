import { SockaDoSession, type SockaDoSessionConfig, SockaWebSocketDO } from "@firtoz/socka/do";
import {
	CHAT_DISPLAY_NAME_MAX_CHARS,
	CHAT_MESSAGE_TEXT_MAX_CHARS,
	CHATROOM_INTERNAL_SECRET_HEADER,
	type ChatMessageRow,
	chatContract,
} from "@internal/chat-contract";
import type { InferSelectModel } from "drizzle-orm";
import { desc } from "drizzle-orm";
import { type DrizzleSqliteDODatabase, drizzle } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import migrationConfig from "../drizzle/migrations.js";
import * as schema from "../src/schema";
import { chatMessagesTable } from "../src/schema";

type SessionData = { userId: string; displayName: string };

const TTL_MS = 15 * 60 * 1000;

function sortPresence(users: { userId: string; displayName: string }[]) {
	return [...users].sort(
		(a, b) => a.displayName.localeCompare(b.displayName) || a.userId.localeCompare(b.userId),
	);
}

type ChatroomDb = DrizzleSqliteDODatabase<typeof schema>;
type ChatroomSession = SockaDoSession<typeof chatContract, SessionData, Env>;

/** Initial display name from `wss://…/api/ws/room?name=` — capped to contract max. */
function clampChatDisplayNameFromQuery(raw: string | null): string {
	const base = raw?.trim() || "anon";
	return base.length <= CHAT_DISPLAY_NAME_MAX_CHARS
		? base
		: base.slice(0, CHAT_DISPLAY_NAME_MAX_CHARS);
}

function chatMessageRowFromDb(r: InferSelectModel<typeof chatMessagesTable>): ChatMessageRow {
	return {
		id: r.id,
		ts: r.ts,
		userId: r.userId,
		displayName:
			r.displayName.length <= CHAT_DISPLAY_NAME_MAX_CHARS
				? r.displayName
				: r.displayName.slice(0, CHAT_DISPLAY_NAME_MAX_CHARS),
		text:
			r.text.length <= CHAT_MESSAGE_TEXT_MAX_CHARS
				? r.text
				: r.text.slice(0, CHAT_MESSAGE_TEXT_MAX_CHARS),
	};
}

export class ChatroomDo extends SockaWebSocketDO<ChatroomSession, Env> {
	readonly app = this.getBaseApp();
	private db: ChatroomDb | null = null;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env, {
			createSockaSession: (_c, ws) => new SockaDoSession(ws, this.sessions, this.buildConfig()),
		});
		void ctx.blockConcurrencyWhile(async () => {
			const db = drizzle(ctx.storage, { schema });
			await migrate(db, migrationConfig);
			this.db = db;
		});
	}

	private getDb(): ChatroomDb {
		if (this.db === null) {
			throw new Error("Chatroom DO database not ready");
		}
		return this.db;
	}

	override fetch(request: Request): Response | Promise<Response> {
		const url = new URL(request.url);
		if (
			url.pathname === "/websocket" &&
			request.headers.get(CHATROOM_INTERNAL_SECRET_HEADER) !== this.env.CHATROOM_INTERNAL_SECRET
		) {
			return new Response("Unauthorized chatroom websocket", { status: 401 });
		}
		return super.fetch(request);
	}

	private buildConfig(): SockaDoSessionConfig<typeof chatContract, SessionData, Env> {
		return {
			contract: chatContract,
			wireFormat: "json",
			createData: (ctx) => {
				const u = new URL(ctx.req.url);
				const displayName = u.searchParams.get("name")?.trim() || "anon";
				return { userId: crypto.randomUUID(), displayName };
			},
			onAttached: async (session) => {
				this.touchActivityTtl();
				await session.broadcastPush(
					"userJoined",
					{ userId: session.data.userId, displayName: session.data.displayName },
					true,
				);
				const users = sortPresence(
					session.listPeers().map((d) => ({ userId: d.userId, displayName: d.displayName })),
				);
				await session.broadcastPush("presenceUpdated", { users }, false);
			},
			handlers: {
				listHistory: async (input: unknown) => {
					this.touchActivityTtl();
					const { limit } = input as { limit?: number };
					const lim = limit ?? 200;
					const rows = await this.getDb()
						.select()
						.from(chatMessagesTable)
						.orderBy(desc(chatMessagesTable.ts))
						.limit(lim);
					const messages: ChatMessageRow[] = rows.reverse().map((r) => chatMessageRowFromDb(r));
					return { messages };
				},
				listPresence: async (_input, session) => {
					this.touchActivityTtl();
					const users = sortPresence(
						session.listPeers().map((d) => ({ userId: d.userId, displayName: d.displayName })),
					);
					return { selfUserId: session.data.userId, users };
				},
				setDisplayName: async (input, session) => {
					this.touchActivityTtl();
					const { displayName } = input as { displayName: string };
					const t = clampChatDisplayNameFromQuery(displayName);
					session.data.displayName = t;
					const users = sortPresence(
						session.listPeers().map((d) => ({ userId: d.userId, displayName: d.displayName })),
					);
					await session.broadcastPush("presenceUpdated", { users }, false);
					return { ok: true as const };
				},
				sendMessage: async (input, session) => {
					this.touchActivityTtl();
					const { text } = input as { text: string };
					const row: ChatMessageRow = {
						id: crypto.randomUUID(),
						ts: Date.now(),
						userId: session.data.userId,
						displayName: session.data.displayName,
						text,
					};
					await this.getDb().insert(chatMessagesTable).values({
						id: row.id,
						ts: row.ts,
						userId: row.userId,
						displayName: row.displayName,
						text: row.text,
					});
					await session.broadcastPush("roomMessage", row);
					return { ok: true as const };
				},
				clearHistory: async (_input, session) => {
					this.touchActivityTtl();
					await this.getDb().delete(chatMessagesTable);
					const ts = Date.now();
					await session.broadcastPush("historyCleared", {
						ts,
						clearedByUserId: session.data.userId,
						clearedByDisplayName: session.data.displayName,
					});
					return { ok: true as const };
				},
			},
			handleClose: async (session) => {
				this.touchActivityTtl();
				await session.broadcastPush(
					"userLeft",
					{ userId: session.data.userId, displayName: session.data.displayName },
					true,
				);
				const users = sortPresence(
					session
						.listPeers({ excludeSelf: true })
						.map((d) => ({ userId: d.userId, displayName: d.displayName })),
				);
				await session.broadcastPush("presenceUpdated", { users }, false);
			},
		};
	}

	/** Resets the 15m DO TTL. Not called from the constructor. */
	private touchActivityTtl(): void {
		void this.ctx.storage.setAlarm(Date.now() + TTL_MS);
	}

	override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
		this.touchActivityTtl();
		return super.webSocketMessage(ws, message);
	}

	override async alarm(): Promise<void> {
		await this.ctx.storage.deleteAll();
	}
}
