import { SockaDoSession, type SockaDoSessionConfig, SockaWebSocketDO } from "@firtoz/socka/do";
import { PROFILE_NAME_MAX_CHARS } from "@internal/auth-db/constants";
import {
	CHAT_MESSAGE_TEXT_MAX_CHARS,
	CHATROOM_AUTH_DISPLAY_NAME_HEADER,
	CHATROOM_AUTH_IS_GUEST_HEADER,
	CHATROOM_AUTH_USER_ID_HEADER,
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

type SessionData = { userId: string; displayName: string; isGuest: boolean };

const TTL_MS = 15 * 60 * 1000;

function sortPresence(users: { userId: string; displayName: string; isGuest: boolean }[]) {
	return [...users].sort(
		(a, b) => a.displayName.localeCompare(b.displayName) || a.userId.localeCompare(b.userId),
	);
}

type ChatroomDb = DrizzleSqliteDODatabase<typeof schema>;
type ChatroomSession = SockaDoSession<typeof chatContract, SessionData, Env>;

/** Clamp display name input to contract max. */
function clampChatDisplayName(raw: string | null): string {
	const base = raw?.trim() || "anon";
	return base.length <= PROFILE_NAME_MAX_CHARS ? base : base.slice(0, PROFILE_NAME_MAX_CHARS);
}

function chatMessageRowFromDb(r: InferSelectModel<typeof chatMessagesTable>): ChatMessageRow {
	return {
		id: r.id,
		ts: r.ts,
		userId: r.userId,
		displayName:
			r.displayName.length <= PROFILE_NAME_MAX_CHARS
				? r.displayName
				: r.displayName.slice(0, PROFILE_NAME_MAX_CHARS),
		isGuest: r.isGuest,
		text:
			r.text.length <= CHAT_MESSAGE_TEXT_MAX_CHARS
				? r.text
				: r.text.slice(0, CHAT_MESSAGE_TEXT_MAX_CHARS),
	};
}

function presenceFromSession(data: SessionData) {
	return {
		userId: data.userId,
		displayName: data.displayName,
		isGuest: data.isGuest,
	};
}

function isGuestFromAttestedHeader(raw: string | null | undefined): boolean {
	return raw?.trim().toLowerCase() === "true";
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
		if (url.pathname === "/websocket") {
			const secretOk =
				request.headers.get(CHATROOM_INTERNAL_SECRET_HEADER) ===
				this.env["CHATROOM_INTERNAL_SECRET"];
			const userId = request.headers.get(CHATROOM_AUTH_USER_ID_HEADER)?.trim();
			const displayName = request.headers.get(CHATROOM_AUTH_DISPLAY_NAME_HEADER)?.trim();
			if (!secretOk) {
				return new Response("Unauthorized chatroom websocket", { status: 401 });
			}
			if (!userId || !displayName) {
				return new Response("Missing attested chat identity", { status: 401 });
			}
		}
		return super.fetch(request);
	}

	private buildConfig(): SockaDoSessionConfig<typeof chatContract, SessionData, Env> {
		return {
			contract: chatContract,
			wireFormat: "json",
			createData: (ctx) => {
				const userId = ctx.req.header(CHATROOM_AUTH_USER_ID_HEADER)?.trim();
				const displayName = ctx.req.header(CHATROOM_AUTH_DISPLAY_NAME_HEADER)?.trim();
				const isGuest = isGuestFromAttestedHeader(ctx.req.header(CHATROOM_AUTH_IS_GUEST_HEADER));
				if (!userId || !displayName) {
					throw new Error("Chat requires attested identity headers");
				}
				const name =
					displayName.length <= PROFILE_NAME_MAX_CHARS
						? displayName
						: displayName.slice(0, PROFILE_NAME_MAX_CHARS);
				return { userId, displayName: name, isGuest };
			},
			onAttached: async (session) => {
				this.touchActivityTtl();
				await session.broadcastPush("userJoined", presenceFromSession(session.data), true);
				const users = sortPresence(session.listPeers().map((d) => presenceFromSession(d)));
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
					const users = sortPresence(session.listPeers().map((d) => presenceFromSession(d)));
					return { selfUserId: session.data.userId, users };
				},
				setDisplayName: async (input, session) => {
					this.touchActivityTtl();
					const { displayName } = input as { displayName: string };
					const t = clampChatDisplayName(displayName);
					session.data.displayName = t;
					const users = sortPresence(session.listPeers().map((d) => presenceFromSession(d)));
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
						isGuest: session.data.isGuest,
						text,
					};
					await this.getDb().insert(chatMessagesTable).values({
						id: row.id,
						ts: row.ts,
						userId: row.userId,
						displayName: row.displayName,
						isGuest: row.isGuest,
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
						clearedByIsGuest: session.data.isGuest,
					});
					return { ok: true as const };
				},
			},
			handleClose: async (session) => {
				this.touchActivityTtl();
				await session.broadcastPush("userLeft", presenceFromSession(session.data), true);
				const users = sortPresence(
					session.listPeers({ excludeSelf: true }).map((d) => presenceFromSession(d)),
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
