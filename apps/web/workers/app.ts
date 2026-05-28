import { WorkerEntrypoint } from "cloudflare:workers";
import { createRequestHandler } from "react-router";
import type { CloudflareEnv } from "../types/env.d.ts";
import { createWebWorkerApp } from "./hono-app";

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

const webWorkerApp = createWebWorkerApp(requestHandler);

/**
 * Web Application Worker Entrypoint: `/api/auth/*` → auth worker, Socka WS → chatroom, else React Router.
 */
export default class WebAppWorker extends WorkerEntrypoint<CloudflareEnv> {
	readonly app = webWorkerApp;

	async fetch(request: Request): Promise<Response> {
		return webWorkerApp.fetch(request, this.env, this.ctx);
	}
}
