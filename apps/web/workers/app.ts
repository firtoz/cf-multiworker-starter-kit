import { WorkerEntrypoint } from "cloudflare:workers";
import { AUTH_API_PREFIX, accountDisplayName, getSession } from "@internal/auth-client";
import {
	CHATROOM_AUTH_DISPLAY_NAME_HEADER,
	CHATROOM_AUTH_IS_GUEST_HEADER,
	CHATROOM_AUTH_USER_ID_HEADER,
	CHATROOM_INTERNAL_SECRET_HEADER,
	resolveChatAttestedIdentity,
} from "@internal/chat-contract";
import { createRequestHandler } from "react-router";
import type { CloudflareEnv } from "../types/env.d.ts";

/**
 * Extend the AppLoadContext interface from react-router
 * to include Cloudflare-specific context
 */
declare module "react-router" {
	export interface AppLoadContext {
		cloudflare: {
			env: CloudflareEnv;
			ctx: ExecutionContext;
		};
	}
}

const requestHandler = createRequestHandler(
	() => import("virtual:react-router/server-build") as Promise<import("react-router").ServerBuild>,
	import.meta.env["MODE"],
);

const CHAT_WS_PREFIX = "/api/ws/";
const WORKER_SERVICES_PATH = "/api/worker-services";

function sanitizeChatRoomId(raw: string): string {
	const t = raw.trim().toLowerCase().slice(0, 64);
	if (t.length === 0 || !/^[a-z0-9_-]+$/.test(t)) {
		return "lobby";
	}
	return t;
}

/**
 * Web Application Worker Entrypoint: `/api/auth/*` → auth worker, Socka WS → chatroom, else React Router.
 */
export default class WebAppWorker extends WorkerEntrypoint<CloudflareEnv> {
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === WORKER_SERVICES_PATH) {
			if (request.method !== "GET") {
				return new Response("Method Not Allowed", { status: 405 });
			}
			const [pingAck, otherAck] = await Promise.all([
				(async () => {
					const res = await this.env.PING.fetch("http://ping/ping-service-ack");
					return { ok: res.ok, status: res.status };
				})(),
				(async () => {
					const res = await this.env.OTHER.fetch("http://other/other-service-ack");
					return { ok: res.ok, status: res.status };
				})(),
			]);

			return Response.json({
				pingAck,
				otherAck,
				note: "Demo probe: response bodies omitted; use SSR routes or tooling for fuller debugging.",
			});
		}
		if (url.pathname.startsWith(AUTH_API_PREFIX)) {
			return this.env.AUTH.fetch(request);
		}
		if (url.pathname.startsWith(CHAT_WS_PREFIX)) {
			const rest = url.pathname.slice(CHAT_WS_PREFIX.length);
			const room = sanitizeChatRoomId(decodeURIComponent(rest));
			const forward = new URL(request.url);
			forward.pathname = "/websocket";
			forward.search = `?${new URLSearchParams({ room }).toString()}`;

			const session = await getSession(this.env.AUTH, request);
			const identity = resolveChatAttestedIdentity(
				session
					? {
							userId: session.user.id,
							profileDisplayName: accountDisplayName(session.user),
							isAnonymous: session.user.isAnonymous === true,
						}
					: null,
				url.searchParams.get("name"),
			);

			const headers = new Headers(request.headers);
			headers.delete(CHATROOM_AUTH_USER_ID_HEADER);
			headers.delete(CHATROOM_AUTH_DISPLAY_NAME_HEADER);
			headers.delete(CHATROOM_AUTH_IS_GUEST_HEADER);
			headers.set(CHATROOM_AUTH_USER_ID_HEADER, identity.userId);
			headers.set(CHATROOM_AUTH_DISPLAY_NAME_HEADER, identity.displayName);
			headers.set(CHATROOM_AUTH_IS_GUEST_HEADER, identity.isGuest ? "true" : "false");
			headers.set(CHATROOM_INTERNAL_SECRET_HEADER, this.env.CHATROOM_INTERNAL_SECRET);

			const forwardRequest = new Request(forward.toString(), { headers, method: request.method });
			return this.env.CHATROOM.fetch(forwardRequest);
		}
		return requestHandler(request, {
			cloudflare: { env: this.env, ctx: this.ctx },
		});
	}
}
