import { WorkerEntrypoint } from "cloudflare:workers";
import { Hono } from "hono";
import type { PingWorkerRpc } from "../../ping-do/workers/rpc";
import type { CloudflareEnv } from "../env";

// Narrow the Hono route bindings to the service surface it uses. Passing the
// full Alchemy-inferred CloudflareEnv through Hono can trip deep RPC inference.
type WorkerBindings = Omit<CloudflareEnv, "PING"> & {
	PING: Service<PingWorkerRpc>;
};

const app = new Hono<{ Bindings: WorkerBindings }>();

/**
 * Other worker calls the ping **service** (WorkerEntrypoint), not the Ping DO.
 */
app.get("/ping", async (c) => {
	const body = await c.env.PING.pingServiceAck();
	return c.text(`other-worker: PING.pingServiceAck() → ${body}`);
});

app.get("/other-service-ack", (c) => c.text("other-service-ack"));

export default class OtherWorker extends WorkerEntrypoint<Env> {
	readonly app = app;

	async otherServiceAck(): Promise<string> {
		return "other-service-ack";
	}

	async fetch(request: Request): Promise<Response> {
		return app.fetch(request, this.env, this.ctx);
	}
}
