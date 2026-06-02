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
	cid: string;
	wsStartedAt: number;
	workerForwardAt: number | undefined;
	doReceivedAt: number;
};
type ChatroomDb = DrizzleSqliteDODatabase<typeof schema>;

const TTL_MS = 15 * 60 * 1000;

function doLog(event: string, detail: Record<string, unknown>): void {
	console.log({ event: `chatroom-do:${event}`, ...detail });
}

function elapsedSince(startedAt: number): number {
	return Date.now() - startedAt;
}

function queryEpochMs(ctx: Context<{ Bindings: Env }>, name: string): number | undefined {
	const raw = ctx.req.query(name);
	if (!raw) {
		return undefined;
	}
	const value = Number(raw);
	return Number.isFinite(value) ? value : undefined;
}

function ageSince(epochMs: number | undefined, now = Date.now()): number | undefined {
	return epochMs === undefined ? undefined : now - epochMs;
}

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
	private readonly wsTraceByCid = new Map<
		string,
		{ wsStartedAt: number; workerForwardAt: number | undefined; doReceivedAt: number }
	>();

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		void ctx.blockConcurrencyWhile(async () => {
			const startedAt = Date.now();
			doLog("migration:start", {});
			const db = drizzle(ctx.storage, { schema });
			await migrate(db, migrationConfig);
			this.db = db;
			doLog("migration:done", { durationMs: Date.now() - startedAt });
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
		const room = ctx.req.query("room") ?? "lobby";
		const cid = ctx.req.query("cid") ?? "missing";
		const startedAt = Date.now();
		const wsStartedAt = queryEpochMs(ctx, "wsStart") ?? startedAt;
		const workerForwardAt = queryEpochMs(ctx, "workerForwardAt");
		this.wsTraceByCid.set(cid, { wsStartedAt, workerForwardAt, doReceivedAt: startedAt });
		doLog("ws:do:before", {
			room,
			cid,
			elapsedMs: elapsedSince(startedAt),
			wsStartAgeMs: ageSince(wsStartedAt, startedAt),
			workerToDoMs: ageSince(workerForwardAt, startedAt),
		});
		const denied = attestedWebSocketDenied(ctx.req.raw.headers, this.env.CHATROOM_INTERNAL_SECRET);
		if (denied) {
			doLog("ws:do:denied", {
				room,
				cid,
				status: denied.status,
				elapsedMs: elapsedSince(startedAt),
				wsStartAgeMs: ageSince(wsStartedAt),
			});
			this.wsTraceByCid.delete(cid);
			return denied;
		}
		doLog("ws:do:allowed", {
			room,
			cid,
			elapsedMs: elapsedSince(startedAt),
			wsStartAgeMs: ageSince(wsStartedAt),
		});
		return undefined;
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
				const cid = ctx.req.query("cid") ?? "missing";
				const trace = this.wsTraceByCid.get(cid);
				const wsStartedAt = trace?.wsStartedAt ?? Date.now();
				const userId = ctx.req.header(CHATROOM_AUTH_USER_ID_HEADER)?.trim();
				const displayName = ctx.req.header(CHATROOM_AUTH_DISPLAY_NAME_HEADER)?.trim();
				const isGuest = isGuestFromAttestedHeader(ctx.req.header(CHATROOM_AUTH_IS_GUEST_HEADER));
				if (!userId || !displayName) {
					doLog("ws:do:create-data-missing", {
						room,
						cid,
						elapsedMs: elapsedSince(wsStartedAt),
					});
					this.wsTraceByCid.delete(cid);
					throw new Error("Chat requires attested identity headers");
				}
				const name =
					displayName.length <= PROFILE_NAME_MAX_CHARS
						? displayName
						: displayName.slice(0, PROFILE_NAME_MAX_CHARS);
				doLog("ws:do:create-data-ok", {
					room,
					cid,
					userId,
					isGuest,
					elapsedMs: elapsedSince(wsStartedAt),
					doCreateDataAfterReceiveMs: ageSince(trace?.doReceivedAt),
				});
				return {
					userId,
					displayName: name,
					isGuest,
					room,
					cid,
					wsStartedAt,
					workerForwardAt: trace?.workerForwardAt,
					doReceivedAt: trace?.doReceivedAt ?? Date.now(),
				};
			},
			onAttached: async (session) => {
				doLog("ws:do:attached", {
					room: session.data.room,
					cid: session.data.cid,
					userId: session.data.userId,
					isGuest: session.data.isGuest,
					peerCount: session.peerCount(),
					elapsedMs: elapsedSince(session.data.wsStartedAt),
					workerForwardAgeMs: ageSince(session.data.workerForwardAt),
					doAttachAfterReceiveMs: ageSince(session.data.doReceivedAt),
				});
				this.wsTraceByCid.delete(session.data.cid);
				this.touchActivityTtl();
				await session.broadcastPush("userJoined", presenceFromSession(session.data), true);
				const users = sortPresence(session.listPeers().map((d) => presenceFromSession(d)));
				await session.broadcastPush("presenceUpdated", { users }, false);
			},
			handlers: {
				listHistory: async (input: unknown, session) => {
					const startedAt = Date.now();
					this.touchActivityTtl();
					const { limit } = input as { limit?: number };
					const lim = limit ?? 200;
					const rows = await this.getDb()
						.select()
						.from(chatMessagesTable)
						.orderBy(desc(chatMessagesTable.ts))
						.limit(lim);
					const messages = rows.reverse();
					doLog("call:list-history", {
						room: session.data.room,
						cid: session.data.cid,
						count: messages.length,
						elapsedMs: elapsedSince(startedAt),
						wsStartAgeMs: ageSince(session.data.wsStartedAt),
					});
					return { messages };
				},
				listPresence: async (_input, session) => {
					const startedAt = Date.now();
					this.touchActivityTtl();
					const users = sortPresence(session.listPeers().map((d) => presenceFromSession(d)));
					doLog("call:list-presence", {
						room: session.data.room,
						cid: session.data.cid,
						count: users.length,
						elapsedMs: elapsedSince(startedAt),
						wsStartAgeMs: ageSince(session.data.wsStartedAt),
					});
					return { selfUserId: session.data.userId, users };
				},
				setDisplayName: async (input, session) => {
					const startedAt = Date.now();
					this.touchActivityTtl();
					const { displayName } = input as { displayName: string };
					const t = clampChatDisplayName(displayName);
					session.data.displayName = t;
					await session.update();
					const users = sortPresence(session.listPeers().map((d) => presenceFromSession(d)));
					await session.broadcastPush("presenceUpdated", { users }, false);
					doLog("call:set-display-name", {
						room: session.data.room,
						cid: session.data.cid,
						elapsedMs: elapsedSince(startedAt),
					});
					return { ok: true as const };
				},
				sendMessage: async (input, session) => {
					const startedAt = Date.now();
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
					doLog("call:send-message", {
						room: session.data.room,
						cid: session.data.cid,
						messageId: row.id,
						elapsedMs: elapsedSince(startedAt),
						wsStartAgeMs: ageSince(session.data.wsStartedAt),
					});
					return { ok: true as const };
				},
				clearHistory: async (_input, session) => {
					const startedAt = Date.now();
					this.touchActivityTtl();
					await this.getDb().delete(chatMessagesTable);
					const ts = Date.now();
					await session.broadcastPush("historyCleared", {
						ts,
						clearedByUserId: session.data.userId,
						clearedByDisplayName: session.data.displayName,
						clearedByIsGuest: session.data.isGuest,
					});
					doLog("call:clear-history", {
						room: session.data.room,
						cid: session.data.cid,
						elapsedMs: elapsedSince(startedAt),
					});
					return { ok: true as const };
				},
			},
			handleClose: async (session) => {
				doLog("ws:do:close", {
					room: session.data.room,
					cid: session.data.cid,
					userId: session.data.userId,
					isGuest: session.data.isGuest,
					peerCount: session.peerCount(),
					lifetimeMs: elapsedSince(session.data.wsStartedAt),
				});
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
