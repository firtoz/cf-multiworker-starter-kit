import { AUTH_API_PREFIX, GUEST_API_PREFIX } from "@internal/auth-client";
import {
	applyChatIdentityHeaders,
	buildWebSocketForwardRequest,
	CHATROOM_INTERNAL_SECRET_HEADER,
	stripClientChatIdentityHeaders,
} from "@internal/chat-contract";
import { Hono } from "hono";
import type { CloudflareEnv } from "../types/env.d.ts";
import { resolveChatIdentityFromAuth } from "./resolve-chat-identity";

const CHAT_WS_PREFIX = "/api/ws/";

function sanitizeChatRoomId(raw: string): string {
	const t = raw.trim().toLowerCase().slice(0, 64);
	if (t.length === 0 || !/^[a-z0-9_-]+$/.test(t)) {
		return "lobby";
	}
	return t;
}

export function createWebWorkerApp(
	requestHandler: (
		request: Request,
		loadContext: {
			cloudflare: { env: CloudflareEnv; ctx: ExecutionContext };
		},
	) => Response | Promise<Response>,
) {
	return new Hono<{ Bindings: CloudflareEnv }>()
		.get("/api/worker-services", async (c) => {
			const [pingAck, otherAck, chatroomAck] = await Promise.all([
				(async () => {
					const res = await c.env.PING.fetch("http://ping/ping-service-ack");
					return { ok: res.ok, status: res.status };
				})(),
				(async () => {
					const res = await c.env.OTHER.fetch("http://other/other-service-ack");
					return { ok: res.ok, status: res.status };
				})(),
				(async () => {
					const res = await c.env.CHATROOM.fetch("http://chatroom/service-ack");
					if (!res.ok) {
						return { ok: false, status: res.status };
					}
					return (await res.json()) as {
						ok: boolean;
						authBinding?: boolean;
						emailAuthEnabled?: boolean;
					};
				})(),
			]);

			return c.json({
				pingAck,
				otherAck,
				chatroomAck,
				note: "Demo probe: chatroomAck confirms AUTH service binding from chatroom worker.",
			});
		})
		.all(`${AUTH_API_PREFIX}*`, (c) => c.env.AUTH.fetch(c.req.raw))
		.all(`${GUEST_API_PREFIX}*`, (c) => c.env.AUTH.fetch(c.req.raw))
		.all(`${CHAT_WS_PREFIX}*`, async (c) => {
			const rest = c.req.path.slice(CHAT_WS_PREFIX.length);
			const room = sanitizeChatRoomId(decodeURIComponent(rest));
			const forward = new URL(c.req.url);
			forward.pathname = "/websocket";
			forward.search = `?${new URLSearchParams({ room }).toString()}`;

			const identity = await resolveChatIdentityFromAuth(c.env.AUTH, c.req.raw);
			if (!identity) {
				return c.text("Chat requires an auth session", 401);
			}

			const headers = new Headers(c.req.raw.headers);
			stripClientChatIdentityHeaders(headers);
			applyChatIdentityHeaders(headers, identity);
			headers.set(CHATROOM_INTERNAL_SECRET_HEADER, c.env.CHATROOM_INTERNAL_SECRET);

			return c.env.CHATROOM.fetch(buildWebSocketForwardRequest(forward, c.req.raw, headers));
		})
		.all("*", (c) =>
			requestHandler(c.req.raw, {
				cloudflare: { env: c.env, ctx: c.executionCtx },
			}),
		);
}

export type WebWorkerApp = ReturnType<typeof createWebWorkerApp>;
