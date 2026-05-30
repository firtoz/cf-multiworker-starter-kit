import { createMiddleware } from "hono/factory";
import type { AuthWorkerAppEnv } from "./app-env";

/** Resolve Better Auth session once per auth-worker HTTP request (custom Hono routes). */
export const loadAuthSession = createMiddleware<AuthWorkerAppEnv>(async (c, next) => {
	c.set(
		"authSession",
		await c.var.auth.api.getSession({
			headers: c.req.raw.headers,
			query: { disableCookieCache: true },
		}),
	);
	await next();
});
