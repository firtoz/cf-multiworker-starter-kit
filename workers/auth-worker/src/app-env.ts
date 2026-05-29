import type { authWorker } from "../alchemy.run";
import type { createAuth } from "./auth";

type CloudflareEnv = (typeof authWorker)["Env"];

/** Shared Hono env for auth-worker routes (Bindings + per-request Variables). */
export type AuthWorkerAppEnv = {
	Bindings: CloudflareEnv;
	Variables: {
		auth: ReturnType<typeof createAuth>;
		trustedOrigins: string[];
	};
};
