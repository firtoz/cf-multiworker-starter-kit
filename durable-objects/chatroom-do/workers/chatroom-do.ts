import { fail, success } from "@firtoz/maybe-error";
import { type SockaDoSessionConfigInput, SockaWebSocketDO } from "@firtoz/socka/do";
import { PROFILE_NAME_MAX_CHARS } from "@internal/auth-db/constants";
import {
	CHATROOM_AUTH_DISPLAY_NAME_HEADER,
	CHATROOM_AUTH_IS_GUEST_HEADER,
	CHATROOM_AUTH_USER_ID_HEADER,
	CHATROOM_INTERNAL_SECRET_HEADER,
	chatContract,
} from "@internal/chat-contract";
import {
	type ChatroomAdminApiError,
	type ChatroomAdminDeleteResult,
	chatroomAdminDeleteHttpStatus,
	checkChatroomAdminAllowed,
} from "@internal/chat-contract/admin-http";
import { desc, eq } from "drizzle-orm";
import { type DrizzleSqliteDODatabase, drizzle } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import type { Context, TypedResponse } from "hono";
import migrationConfig from "../drizzle/migrations.js";
import * as schema from "../src/schema";
import { type ChatMessageInsert, chatMessagesTable } from "../src/schema";

type SessionData = {
	userId: string;
	displayName: string;
	isGuest: boolean;
	room: string;
};
type ChatroomDb = DrizzleSqliteDODatabase<typeof schema>;

const TTL_MS = 15 * 60 * 1000;

function sortPresence(users: { userId: string; displayName: string; isGuest: boolean }[]) {
	return [...users].sort(
		(a, b) => a.displayName.localeCompare(b.displayName) || a.userId.localeCompare(b.userId),
	);
}

function clampChatDisplayName(raw: string | null): string {
	const base = raw?.trim() || "anon";
	return base.length <= PROFILE_NAME_MAX_CHARS ? base : base.slice(0, PROFILE_NAME_MAX_CHARS);
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

function attestedWebSocketDenied(headers: Headers, internalSecret: string): Response | undefined {
	const secretOk = headers.get(CHATROOM_INTERNAL_SECRET_HEADER) === internalSecret;
	if (!secretOk) {
		return new Response("Unauthorized chatroom websocket", { status: 401 });
	}
	const userId = headers.get(CHATROOM_AUTH_USER_ID_HEADER)?.trim();
	const displayName = headers.get(CHATROOM_AUTH_DISPLAY_NAME_HEADER)?.trim();
	if (!userId || !displayName) {
		return new Response("Missing attested chat identity", { status: 401 });
	}
	return undefined;
}

/** RFC 6455 reserves 1005/1006 — Cloudflare rejects them in `WebSocket#close()`. */
function sanitizeWebSocketCloseCode(code: number): number {
	if (code === 1005 || code === 1006 || code < 1000 || code >= 5000) {
		return 1000;
	}
	return code;
}

export class ChatroomDo extends SockaWebSocketDO<typeof chatContract, SessionData, Env> {
	protected readonly contract = chatContract;

	readonly app = this.getBaseApp().delete(
		"/admin/messages/:messageId",
		async (c): Promise<TypedResponse<ChatroomAdminDeleteResult>> => {
			const allowed = checkChatroomAdminAllowed(
				c.req.raw.headers,
				this.env.CHATROOM_INTERNAL_SECRET,
			);
			if (!allowed.success) {
				return c.json(allowed, allowed.error.status);
			}
			const result = await this.deleteMessageForAdmin(c.req.param("messageId"));
			return c.json(result, chatroomAdminDeleteHttpStatus(result));
		},
	);

	private db: ChatroomDb | null = null;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
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

	async deleteMessageForAdmin(messageId: string): Promise<ChatroomAdminDeleteResult> {
		const id = messageId.trim();
		if (!id) {
			return fail<ChatroomAdminApiError>({ message: "Message id required", status: 400 });
		}
		const deleted = await this.getDb()
			.delete(chatMessagesTable)
			.where(eq(chatMessagesTable.id, id))
			.returning({ id: chatMessagesTable.id });
		if (deleted.length === 0) {
			return fail<ChatroomAdminApiError>({ message: "Not found", status: 404 });
		}
		this.touchActivityTtl();
		await this.broadcastPushToAll("messageDeleted", { id });
		return success(true);
	}

	protected beforeWebSocket(ctx: Context<{ Bindings: Env }>): Response | undefined {
		return attestedWebSocketDenied(ctx.req.raw.headers, this.env.CHATROOM_INTERNAL_SECRET);
	}

	protected buildSockaSessionConfig(): SockaDoSessionConfigInput<
		typeof chatContract,
		SessionData,
		Env
	> {
		return {
			wireFormat: "json",
			createData: (ctx) => {
				const room = ctx.req.query("room") ?? "lobby";
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
				return {
					userId,
					displayName: name,
					isGuest,
					room,
				};
			},
			onAttached: async (session) => {
				this.touchActivityTtl();
				await session.broadcastPush("userJoined", presenceFromSession(session.data), true);
				const users = sortPresence(session.listPeers().map((d) => presenceFromSession(d)));
				await session.broadcastPush("presenceUpdated", { users }, false);
			},
			handlers: {
				listHistory: async (input: unknown, _session) => {
					this.touchActivityTtl();
					const { limit } = input as { limit?: number };
					const lim = limit ?? 200;
					const rows = await this.getDb()
						.select()
						.from(chatMessagesTable)
						.orderBy(desc(chatMessagesTable.ts))
						.limit(lim);
					const messages = rows.reverse();
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
					await session.update();
					const users = sortPresence(session.listPeers().map((d) => presenceFromSession(d)));
					await session.broadcastPush("presenceUpdated", { users }, false);
					return { ok: true as const };
				},
				sendMessage: async (input, session) => {
					this.touchActivityTtl();
					const { text } = input as { text: string };
					const row = {
						id: crypto.randomUUID(),
						ts: Date.now(),
						userId: session.data.userId,
						displayName: session.data.displayName,
						isGuest: session.data.isGuest,
						text,
					} satisfies ChatMessageInsert;
					await this.getDb().insert(chatMessagesTable).values(row);
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

	private touchActivityTtl(): void {
		void this.ctx.storage.setAlarm(Date.now() + TTL_MS);
	}

	override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
		this.touchActivityTtl();
		return super.webSocketMessage(ws, message);
	}

	override async webSocketClose(
		ws: WebSocket,
		code: number,
		reason: string,
		wasClean: boolean,
	): Promise<void> {
		await super.webSocketClose(ws, sanitizeWebSocketCloseCode(code), reason, wasClean);
	}

	override async alarm(): Promise<void> {
		await this.ctx.storage.deleteAll();
	}
}
