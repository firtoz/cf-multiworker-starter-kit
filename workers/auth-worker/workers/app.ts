import { WorkerEntrypoint } from "cloudflare:workers";
import { authWorkerApp } from "../src/hono-app";

export default class AuthWorker extends WorkerEntrypoint<Env> {
	readonly app = authWorkerApp;

	async fetch(request: Request): Promise<Response> {
		return authWorkerApp.fetch(request, this.env, this.ctx);
	}
}
