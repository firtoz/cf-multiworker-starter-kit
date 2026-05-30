import {
	AUTH_INTERNAL_ORIGIN,
	authApiPrefix,
	guestApiPrefix,
	machineAdminBootstrapSyncPath,
	resolveDocumentAuthSession,
} from "@internal/auth-client";
import { AUTH_ADMIN_SECRET_HEADER } from "@internal/auth-db/constants";
import { INTERNAL_BINDING_SESSION_HEADER } from "@internal/auth-db/internal-binding-session";
import {
	applyChatIdentityHeaders,
	buildWebSocketForwardRequest,
	CHAT_ATTEST_QUERY_PARAM,
	CHATROOM_INTERNAL_SECRET_HEADER,
	stripClientChatIdentityHeaders,
	verifyChatAttestToken,
} from "@internal/chat-contract";
import {
	POSTHOG_BROWSER_API_PATH,
	rewritePosthogBrowserApiRequest,
} from "alchemy-utils/posthog-host";
import { adminPath } from "auth-worker/admin";
import { Hono } from "hono";
import type { AppLoadContext } from "react-router";
import type { CloudflareEnv } from "../types/env.d.ts";
import { resolveChatIdentityFromAuth } from "./resolve-chat-identity";
import { shouldPreloadAuthSession } from "./should-preload-auth-session";

const CHAT_WS_PREFIX = "/api/ws/";

function sanitizeChatRoomId(raw: string): string {
	const t = raw.trim().toLowerCase().slice(0, 64);
	if (t.length === 0 || !/^[a-z0-9_-]+$/.test(t)) {
		return "lobby";
	}
	return t;
}

function stripInternalBindingSessionHeader(request: Request): Request {
	const headers = new Headers(request.headers);
	headers.delete(INTERNAL_BINDING_SESSION_HEADER);
	return new Request(request, { headers });
}

export function createWebWorkerApp(
	requestHandler: (request: Request, loadContext: AppLoadContext) => Response | Promise<Response>,
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
		.all(`${CHAT_WS_PREFIX}*`, async (c) => {
			const rest = c.req.path.slice(CHAT_WS_PREFIX.length);
			const room = sanitizeChatRoomId(decodeURIComponent(rest));
			const forward = new URL(c.req.url);
			forward.pathname = "/websocket";
			const attest = forward.searchParams.get(CHAT_ATTEST_QUERY_PARAM);
			forward.search = `?${new URLSearchParams({ room }).toString()}`;

			let identity =
				attest == null
					? null
					: await verifyChatAttestToken(attest, room, c.env.CHATROOM_INTERNAL_SECRET);
			if (!identity) {
				identity = await resolveChatIdentityFromAuth(c.env.AUTH, c.req.raw);
			}
			if (!identity) {
				return c.text("Chat requires an auth session", 401);
			}

			const headers = new Headers(c.req.raw.headers);
			stripClientChatIdentityHeaders(headers);
			applyChatIdentityHeaders(headers, identity);
			headers.set(CHATROOM_INTERNAL_SECRET_HEADER, c.env.CHATROOM_INTERNAL_SECRET);

			return c.env.CHATROOM.fetch(buildWebSocketForwardRequest(forward, c.req.raw, headers));
		})
		.all("*", async (c) => {
			const pathname = new URL(c.req.url).pathname;
			let staleCookieHeaders: string[] = [];
			const authSession = shouldPreloadAuthSession(pathname)
				? await resolveDocumentAuthSession(c.env.AUTH, c.req.raw).then(
						({ session, staleCookieHeaders: headers }) => {
							staleCookieHeaders = headers;
							return session;
						},
					)
				: null;
			const response = await requestHandler(c.req.raw, {
				cloudflare: { env: c.env, ctx: c.executionCtx },
				authSession,
			});
			if (staleCookieHeaders.length === 0) {
				return response;
			}
			const headers = new Headers(response.headers);
			for (const cookie of staleCookieHeaders) {
				headers.append("Set-Cookie", cookie);
			}
			return new Response(response.body, {
				status: response.status,
				statusText: response.statusText,
				headers,
			});
		});
}

export type WebWorkerApp = ReturnType<typeof createWebWorkerApp>;
