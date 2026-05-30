import type { Context } from "hono";
import type { AuthWorkerAppEnv } from "./app-env";
import type { AuthSession } from "./auth";

/**
 * Primary key of the session row for this request.
 *
 * Better Auth cookie cache can leave `authSession.session.id` out of sync with D1
 * `session.id` on service-binding calls — always prefer a fresh DB lookup by token.
 */
export async function resolveRequestSessionId(
	c: Context<AuthWorkerAppEnv>,
	authSession: AuthSession,
): Promise<string> {
	const fromDb = await c.var.auth.api.getSession({
		headers: c.req.raw.headers,
		query: { disableCookieCache: true },
	});
	return fromDb?.session?.id ?? authSession.session.id;
}
