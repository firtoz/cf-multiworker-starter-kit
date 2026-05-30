import { AUTH_SERVICE_BINDING_HOST } from "@internal/auth-db/constants";
import {
	INTERNAL_BINDING_SESSION_HEADER,
	internalBindingPayloadToAuthSession,
	verifyInternalBindingSessionToken,
} from "@internal/auth-db/internal-binding-session";
import { createMiddleware } from "hono/factory";
import type { AuthWorkerAppEnv } from "./app-env";
import type { AuthSession } from "./auth";

const AUTH_INTERNAL_ORIGIN = `https://${AUTH_SERVICE_BINDING_HOST}` as const;

function isAuthInternalServiceBinding(url: string): boolean {
	try {
		return new URL(url).hostname === new URL(AUTH_INTERNAL_ORIGIN).hostname;
	} catch {
		return false;
	}
}

/** Resolve Better Auth session once per auth-worker HTTP request (custom Hono routes). */
export const loadAuthSession = createMiddleware<AuthWorkerAppEnv>(async (c, next) => {
	if (isAuthInternalServiceBinding(c.req.url)) {
		const token = c.req.header(INTERNAL_BINDING_SESSION_HEADER);
		if (token) {
			const payload = await verifyInternalBindingSessionToken(token, c.env.AUTH_ADMIN_SECRET);
			if (payload) {
				c.set("authSession", internalBindingPayloadToAuthSession(payload) as AuthSession);
				await next();
				return;
			}
		}
	}

	c.set("authSession", await c.var.auth.api.getSession({ headers: c.req.raw.headers }));
	await next();
});
