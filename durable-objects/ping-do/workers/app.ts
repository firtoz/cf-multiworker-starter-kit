import { WorkerEntrypoint } from "cloudflare:workers";
import { Hono } from "hono";
import type { pingWorker } from "../alchemy.run";
import { PingDo } from "./ping-do";

export { PingDo };

type CloudflareEnv = (typeof pingWorker)["Env"];

const app = new Hono<{ Bindings: CloudflareEnv }>()
	.get("/other", async (c) => {
		const body = await c.env.OTHER.otherServiceAck();
		return c.text(`ping-do worker: /other → OTHER.otherServiceAck() → ${body}`);
	})
	/** Ping WorkerEntrypoint fetch (service binding target for `other-worker`). */
	.get("/ping-service-ack", (c) => c.text("ping-service-ack"));

export default class PingDoWorker extends WorkerEntrypoint<CloudflareEnv> {
	readonly app = app;

	async pingServiceAck(): Promise<string> {
		return "ping-service-ack";
	}

	async fetch(request: Request): Promise<Response> {
		return app.fetch(request, this.env, this.ctx);
	}
}
