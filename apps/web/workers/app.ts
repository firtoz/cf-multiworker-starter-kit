import { WorkerEntrypoint } from "cloudflare:workers";
import { CHATROOM_INTERNAL_SECRET_HEADER } from "cf-starter-chat-contract";
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
 * Web Application Worker Entrypoint: Socka WebSocket → Chatroom DO `/websocket`, else React Router.
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
		if (url.pathname.startsWith(CHAT_WS_PREFIX)) {
			const rest = url.pathname.slice(CHAT_WS_PREFIX.length);
			const room = sanitizeChatRoomId(decodeURIComponent(rest));
			const stub = this.env.ChatroomDo.getByName(room);
			const forward = new URL(request.url);
			forward.pathname = "/websocket";
			const headers = new Headers(request.headers);
			headers.set(CHATROOM_INTERNAL_SECRET_HEADER, this.env.CHATROOM_INTERNAL_SECRET);
			const forwardRequest = new Request(forward.toString(), { headers, method: request.method });
			return stub.fetch(forwardRequest);
		}
		return requestHandler(request, {
			cloudflare: { env: this.env, ctx: this.ctx },
		});
	}
}
