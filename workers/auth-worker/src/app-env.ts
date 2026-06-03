import type { authWorker } from "../alchemy.run";
import type { AuthSession, createAuth } from "./auth";

type CloudflareEnv = (typeof authWorker)["Env"];

/** Shared Hono env for auth-worker routes (Bindings + per-request Variables). */
export type AuthWorkerAppEnv = {
	Bindings: CloudflareEnv;
	Variables: {
		auth: ReturnType<typeof createAuth>;
		trustedOrigins: string[];
		/** Set by {@link loadAuthSession} on custom API routes — avoid a second `getSession` D1 round trip. */
		authSession: AuthSession | null;
	};
};
