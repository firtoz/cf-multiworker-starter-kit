import type { Context } from "hono";
import type { AuthWorkerAppEnv } from "./app-env";

/**
 * Primary key of the session row for this request, or null when the cookie is stale/revoked.
 */
export async function resolveRequestSessionId(
	c: Context<AuthWorkerAppEnv>,
): Promise<string | null> {
	const fromDb = await c.var.auth.api.getSession({
		headers: c.req.raw.headers,
		query: { disableCookieCache: true },
	});
	return fromDb?.session?.id ?? null;
}
