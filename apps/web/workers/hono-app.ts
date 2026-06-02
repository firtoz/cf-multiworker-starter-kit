import {
	AUTH_INTERNAL_ORIGIN,
	authApiPrefix,
	guestApiPrefix,
	machineAdminBootstrapSyncPath,
} from "@internal/auth-client";
import { AUTH_ADMIN_SECRET_HEADER } from "@internal/auth-db/constants";
import { INTERNAL_BINDING_SESSION_HEADER } from "@internal/auth-db/internal-binding-session";
import {
	applyChatIdentityHeaders,
	buildWebSocketForwardRequest,
	CHAT_ATTEST_QUERY_PARAM,
	CHATROOM_INTERNAL_SECRET_HEADER,
	createChatAttestToken,
	sanitizeChatRoomId,
	stripClientChatIdentityHeaders,
	verifyChatAttestToken,
} from "@internal/chat-contract";
import { registerChatRoom } from "@internal/db";
import {
	POSTHOG_BROWSER_API_PATH,
	rewritePosthogBrowserApiRequest,
} from "alchemy-utils/posthog-host";
import { adminPath } from "auth-worker/admin";
import { Hono } from "hono";
import { RouterContextProvider } from "react-router";
import type { CloudflareEnv } from "../types/env.d.ts";
import { resolveChatIdentityFromAuth } from "./resolve-chat-identity";

const CHAT_WS_PREFIX = "/api/ws/";
const CHAT_DIAG_PATH = "/api/chat/diag";
const CHAT_ATTEST_PATH = "/api/chat/attest";

type ChatDiagPayload = {
	label?: unknown;
	room?: unknown;
	cid?: unknown;
	atMs?: unknown;
	deltaMs?: unknown;
	details?: unknown;
	pageUrl?: unknown;
};

function chatLog(event: string, detail: Record<string, unknown>): void {
	console.log({ event: `chat:${event}`, ...detail });
}

function stringField(value: unknown, fallback = "missing"): string {
	return typeof value === "string" && value.trim().length > 0 ? value.slice(0, 160) : fallback;
}

function numberField(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : undefined;
}

function elapsedSince(startedAt: number): number {
	return Date.now() - startedAt;
}

function ageSince(epochMs: number | undefined, now = Date.now()): number | undefined {
	return epochMs === undefined ? undefined : now - epochMs;
}

function stripInternalBindingSessionHeader(request: Request): Request {
	const headers = new Headers(request.headers);
	headers.delete(INTERNAL_BINDING_SESSION_HEADER);
	return new Request(request, { headers });
}

export function createWebWorkerApp(
	requestHandler: (
		request: Request,
		loadContext: RouterContextProvider,
	) => Response | Promise<Response>,
) {
	return new Hono<{ Bindings: CloudflareEnv }>()
		.get("/api/worker-services", async (c) => {
			const res = await c.env.CHATROOM.fetch("http://chatroom/service-ack");
			if (!res.ok) {
				return c.json({ chatroomAck: { ok: false, status: res.status } });
			}
			const chatroomAck = (await res.json()) as {
				ok: boolean;
				authBinding?: boolean;
				emailAuthEnabled?: boolean;
			};

			return c.json({
				chatroomAck,
				note: "Probe confirms CHATROOM service binding and chatroom → AUTH wiring.",
			});
		})
		.all(`${authApiPrefix}*`, (c) => c.env.AUTH.fetch(stripInternalBindingSessionHeader(c.req.raw)))
		.all(`${guestApiPrefix}*`, (c) =>
			c.env.AUTH.fetch(stripInternalBindingSessionHeader(c.req.raw)),
		)
		.post(machineAdminBootstrapSyncPath, async (c) => {
			const secret = c.req.header(AUTH_ADMIN_SECRET_HEADER);
			if (!secret || secret !== c.env.AUTH_ADMIN_SECRET) {
				return c.text("Not Found", 404);
			}
			const headers = new Headers();
			headers.set(AUTH_ADMIN_SECRET_HEADER, secret);
			return c.env.AUTH.fetch(
				new Request(`${AUTH_INTERNAL_ORIGIN}${adminPath}/bootstrap-sync`, {
					method: "POST",
					headers,
				}),
			);
		})
		.all(`${POSTHOG_BROWSER_API_PATH}/*`, (c) =>
			c.env.POSTHOG.fetch(rewritePosthogBrowserApiRequest(c.req.raw)),
		)
		.all(POSTHOG_BROWSER_API_PATH, (c) =>
			c.env.POSTHOG.fetch(rewritePosthogBrowserApiRequest(c.req.raw)),
		)
		.post(CHAT_DIAG_PATH, async (c) => {
			const body = (await c.req.json().catch(() => ({}))) as ChatDiagPayload;
			const label = stringField(body.label);
			const room = sanitizeChatRoomId(stringField(body.room, "lobby"));
			const cid = stringField(body.cid);
			chatLog("diag:client", {
				label,
				room,
				cid,
				atMs: numberField(body.atMs),
				deltaMs: numberField(body.deltaMs),
				pageUrl: stringField(body.pageUrl, "missing").slice(0, 240),
				details: body.details,
			});
			return c.json({ ok: true });
		})
		.post(CHAT_ATTEST_PATH, async (c) => {
			const startedAt = Date.now();
			const body = (await c.req.json().catch(() => ({}))) as { room?: unknown; cid?: unknown };
			const room = sanitizeChatRoomId(stringField(body.room, "lobby"));
			const cid = stringField(body.cid);
			chatLog("attest:received", { room, cid, elapsedMs: elapsedSince(startedAt) });
			const roomRegistered = registerChatRoom(c.env.DB, room);
			const identity = await resolveChatIdentityFromAuth(c.env.AUTH, c.req.raw);
			await roomRegistered;
			chatLog("attest:room-registered", { room, cid, elapsedMs: elapsedSince(startedAt) });
			chatLog("attest:auth-resolved", {
				room,
				cid,
				hasIdentity: identity != null,
				elapsedMs: elapsedSince(startedAt),
			});
			if (!identity) {
				return c.json({ ok: false, error: "Chat requires an auth session" }, 401);
			}
			const token = await createChatAttestToken(identity, room, c.env.CHATROOM_INTERNAL_SECRET);
			chatLog("attest:token-created", {
				room,
				cid,
				userId: identity.userId,
				isGuest: identity.isGuest,
				elapsedMs: elapsedSince(startedAt),
			});
			return c.json({ ok: true, room, token });
		})
		.all(`${CHAT_WS_PREFIX}*`, async (c) => {
			const startedAt = Date.now();
			const rest = c.req.path.slice(CHAT_WS_PREFIX.length);
			const room = sanitizeChatRoomId(decodeURIComponent(rest));
			const cid = c.req.query("cid") ?? "missing";
			chatLog("ws:web:received", {
				room,
				cid,
				path: c.req.path,
				hasAttest: c.req.query(CHAT_ATTEST_QUERY_PARAM) != null,
				elapsedMs: elapsedSince(startedAt),
			});
			const forward = new URL(c.req.url);
			forward.pathname = "/websocket";
			const attest = forward.searchParams.get(CHAT_ATTEST_QUERY_PARAM);
			forward.search = `?${new URLSearchParams({
				cid,
				room,
				wsStart: String(startedAt),
			}).toString()}`;

			let identity =
				attest == null
					? null
					: await verifyChatAttestToken(attest, room, c.env.CHATROOM_INTERNAL_SECRET);
			if (identity) {
				chatLog("ws:web:attest-ok", {
					room,
					cid,
					elapsedMs: elapsedSince(startedAt),
				});
			} else {
				chatLog("ws:web:attest-miss", {
					room,
					cid,
					hasAttest: attest != null,
					elapsedMs: elapsedSince(startedAt),
				});
				const roomRegistered = registerChatRoom(c.env.DB, room);
				identity = await resolveChatIdentityFromAuth(c.env.AUTH, c.req.raw);
				await roomRegistered;
				chatLog("ws:web:room-registered", {
					room,
					cid,
					elapsedMs: elapsedSince(startedAt),
				});
				chatLog("ws:web:auth-resolved", {
					room,
					cid,
					hasIdentity: identity != null,
					elapsedMs: elapsedSince(startedAt),
				});
			}
			if (!identity) {
				chatLog("ws:web:identity-missing", { room, cid, elapsedMs: elapsedSince(startedAt) });
				return c.text("Chat requires an auth session", 401);
			}
			chatLog("ws:web:identity-ok", {
				room,
				cid,
				userId: identity.userId,
				isGuest: identity.isGuest,
				elapsedMs: elapsedSince(startedAt),
			});

			const headers = new Headers(c.req.raw.headers);
			stripClientChatIdentityHeaders(headers);
			applyChatIdentityHeaders(headers, identity);
			headers.set(CHATROOM_INTERNAL_SECRET_HEADER, c.env.CHATROOM_INTERNAL_SECRET);

			chatLog("ws:web:forward", {
				room,
				cid,
				forwardPath: forward.pathname,
				elapsedMs: elapsedSince(startedAt),
			});
			const webForwardAt = Date.now();
			forward.searchParams.set("webForwardAt", String(webForwardAt));
			const response = await c.env.CHATROOM.fetch(
				buildWebSocketForwardRequest(forward, c.req.raw, headers),
			);
			chatLog("ws:web:forward-response", {
				room,
				cid,
				status: response.status,
				elapsedMs: elapsedSince(startedAt),
				forwardWaitMs: ageSince(webForwardAt),
			});
			return response;
		})
		.all("*", async (c) => requestHandler(c.req.raw, new RouterContextProvider()));
}

export type WebWorkerApp = ReturnType<typeof createWebWorkerApp>;
