import { getAuthProviders } from "@internal/auth-client";
import {
	applyChatIdentityHeaders,
	buildWebSocketForwardRequest,
	CHATROOM_INTERNAL_SECRET_HEADER,
	readChatIdentityHeaders,
	stripClientChatIdentityHeaders,
} from "@internal/chat-contract";
import { Hono } from "hono";
import type { CloudflareEnv } from "../env";

function sanitizeRoomId(raw: string | null | undefined): string {
	const roomRaw = raw?.trim() || "lobby";
	return (
		roomRaw
			.toLowerCase()
			.slice(0, 64)
			.replace(/[^a-z0-9_-]/g, "") || "lobby"
	);
}

export const chatroomWorkerApp = new Hono<{ Bindings: CloudflareEnv }>()
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
	.all("/websocket", async (c) => {
		if (c.req.header(CHATROOM_INTERNAL_SECRET_HEADER) !== c.env.CHATROOM_INTERNAL_SECRET) {
			return c.text("Unauthorized chatroom websocket", 401);
		}

		const identity = readChatIdentityHeaders(c.req.raw.headers);
		if (!identity) {
			return c.text("Missing attested chat identity", 401);
		}

		const stub = c.env.ChatroomDo.getByName(sanitizeRoomId(c.req.query("room")));

		const forward = new URL(c.req.url);
		forward.pathname = "/websocket";
		const headers = new Headers(c.req.raw.headers);
		stripClientChatIdentityHeaders(headers);
		applyChatIdentityHeaders(headers, identity);

		return stub.fetch(buildWebSocketForwardRequest(forward, c.req.raw, headers));
	});

export type ChatroomWorkerApp = typeof chatroomWorkerApp;
