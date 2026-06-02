import { honoDoFetcherWithName } from "@firtoz/hono-fetcher";
import { getAuthProviders } from "@internal/auth-client";
import {
	applyChatIdentityHeaders,
	buildWebSocketForwardRequest,
	CHATROOM_INTERNAL_SECRET_HEADER,
	readChatIdentityHeaders,
	sanitizeChatRoomId,
	stripClientChatIdentityHeaders,
} from "@internal/chat-contract";
import {
	type ChatroomAdminDeleteResult,
	chatroomAdminDeleteHttpStatus,
	checkChatroomAdminAllowed,
} from "@internal/chat-contract/admin-http";
import { Hono, type TypedResponse } from "hono";
import type { HonoClientApp } from "./hono-client-app";
import type { ChatroomWorkerBindingEnv } from "./worker-binding-env";

type ChatroomHonoContext = { Bindings: ChatroomWorkerBindingEnv };

function chatroomLog(event: string, detail: Record<string, unknown>): void {
	console.log({ event: `chatroom:${event}`, ...detail });
}

function elapsedSince(startedAt: number): number {
	return Date.now() - startedAt;
}

function queryEpochMs(c: { req: { query: (name: string) => string | undefined } }, name: string) {
	const raw = c.req.query(name);
	if (!raw) {
		return undefined;
	}
	const value = Number(raw);
	return Number.isFinite(value) ? value : undefined;
}

function ageSince(epochMs: number | undefined, now = Date.now()): number | undefined {
	return epochMs === undefined ? undefined : now - epochMs;
}

export const chatroomWorkerApp = new Hono<ChatroomHonoContext>()
	.get("/service-ack", async (c) => {
		const providers = await getAuthProviders(c.env.AUTH);
		return c.json({
			ok: true,
			authBinding: true,
			emailAuthEnabled: providers.email,
			note: "Chat WS identity is attested on the web worker (env.AUTH); chatroom forwards to the DO.",
		});
	})
	.get("/", (c) => c.text("starter-chatroom-do"))
	.delete(
		"/admin/messages/:messageId",
		async (c): Promise<TypedResponse<ChatroomAdminDeleteResult>> => {
			const allowed = checkChatroomAdminAllowed(c.req.raw.headers, c.env.CHATROOM_INTERNAL_SECRET);
			if (!allowed.success) {
				return c.json(allowed, allowed.error.status);
			}
			const room = sanitizeChatRoomId(c.req.query("room") ?? "lobby");
			using api = honoDoFetcherWithName(c.env.ChatroomDo, room);
			const res = await api.delete({
				url: "/admin/messages/:messageId",
				params: { messageId: c.req.param("messageId") },
				init: { headers: c.req.raw.headers },
			});
			const body = await res.json();
			return c.json(body, chatroomAdminDeleteHttpStatus(body));
		},
	)
	.all("/websocket", async (c) => {
		const startedAt = Date.now();
		const room = sanitizeChatRoomId(c.req.query("room") ?? "lobby");
		const cid = c.req.query("cid") ?? "missing";
		const wsStart = queryEpochMs(c, "wsStart");
		const webForwardAt = queryEpochMs(c, "webForwardAt");
		chatroomLog("ws:worker:received", {
			room,
			cid,
			hasSecret: c.req.header(CHATROOM_INTERNAL_SECRET_HEADER) != null,
			elapsedMs: elapsedSince(startedAt),
			wsStartAgeMs: ageSince(wsStart, startedAt),
			webToWorkerMs: ageSince(webForwardAt, startedAt),
		});
		if (c.req.header(CHATROOM_INTERNAL_SECRET_HEADER) !== c.env.CHATROOM_INTERNAL_SECRET) {
			chatroomLog("ws:worker:bad-secret", { room, cid, elapsedMs: elapsedSince(startedAt) });
			return c.text("Unauthorized chatroom websocket", 401);
		}

		const identity = readChatIdentityHeaders(c.req.raw.headers);
		if (!identity) {
			chatroomLog("ws:worker:identity-missing", { room, cid, elapsedMs: elapsedSince(startedAt) });
			return c.text("Missing attested chat identity", 401);
		}
		chatroomLog("ws:worker:identity-ok", {
			room,
			cid,
			userId: identity.userId,
			isGuest: identity.isGuest,
			elapsedMs: elapsedSince(startedAt),
			wsStartAgeMs: ageSince(wsStart),
		});

		const stub = c.env.ChatroomDo.getByName(room);
		chatroomLog("ws:worker:stub-created", { room, cid, elapsedMs: elapsedSince(startedAt) });

		const forward = new URL(c.req.url);
		forward.pathname = "/websocket";
		const headers = new Headers(c.req.raw.headers);
		stripClientChatIdentityHeaders(headers);
		applyChatIdentityHeaders(headers, identity);

		const workerForwardAt = Date.now();
		forward.searchParams.set("workerForwardAt", String(workerForwardAt));
		chatroomLog("ws:worker:forward-do", {
			room,
			cid,
			elapsedMs: elapsedSince(startedAt),
			wsStartAgeMs: ageSince(wsStart, workerForwardAt),
		});
		const response = await stub.fetch(buildWebSocketForwardRequest(forward, c.req.raw, headers));
		chatroomLog("ws:worker:do-response", {
			room,
			cid,
			status: response.status,
			elapsedMs: elapsedSince(startedAt),
			workerToDoResponseMs: ageSince(workerForwardAt),
			wsStartAgeMs: ageSince(wsStart),
		});
		return response;
	});

export type ChatroomWorkerApp = typeof chatroomWorkerApp;

export type { HonoClientApp } from "./hono-client-app";

/** {@link chatroomWorkerApp} with server bindings stripped — for {@link honoFetcher} clients. */
export type ChatroomWorkerHonoClientApp = HonoClientApp<ChatroomWorkerApp>;

/** Web `CHATROOM` bindings and `WorkerRef<ChatroomWorkerRpc>`. */
export type ChatroomWorkerRpc = Rpc.WorkerEntrypointBranded & {
	readonly app: ChatroomWorkerApp;
	readonly clientApp: ChatroomWorkerHonoClientApp;
};
