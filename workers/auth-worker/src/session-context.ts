import {
	INTERNAL_BINDING_SESSION_HEADER,
	internalBindingPayloadToAuthSession,
	verifyInternalBindingSessionToken,
} from "@internal/auth-db/internal-binding-session";
import { createMiddleware } from "hono/factory";
import type { AuthWorkerAppEnv } from "./app-env";

/** Resolve Better Auth session once per auth-worker HTTP request (custom Hono routes). */
export const loadAuthSession = createMiddleware<AuthWorkerAppEnv>(async (c, next) => {
	const internalSessionToken = c.req.header(INTERNAL_BINDING_SESSION_HEADER);
	if (internalSessionToken) {
		const payload = await verifyInternalBindingSessionToken(
			internalSessionToken,
			c.env.AUTH_ADMIN_SECRET,
		);
		if (payload) {
			const authSession = internalBindingPayloadToAuthSession(
				payload,
			) as AuthWorkerAppEnv["Variables"]["authSession"];
			c.set("authSession", authSession);
			await next();
			return;
		}
	}

	c.set(
		"authSession",
		await c.var.auth.api.getSession({
			headers: c.req.raw.headers,
			query: { disableCookieCache: true },
		}),
	);
	await next();
});
