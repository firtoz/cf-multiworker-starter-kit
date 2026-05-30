import { env } from "cloudflare:workers";
import { type AuthClient, createAuthClient } from "@internal/auth-client";
import type { AppLoadContext } from "react-router";

/**
 * Auth client for React Router loaders/actions on the web worker.
 *
 * Uses worker `env` bindings and the session already resolved in {@link AppLoadContext.authSession}.
 * Prefer this over {@link createAuthClient} in route modules — keeps binding + internal-session wiring in one place.
 */
export function createRouteAuthClient(
	request: Request,
	context: Pick<AppLoadContext, "authSession">,
): AuthClient {
	return createAuthClient(env.AUTH, request, {
		session: context.authSession,
		internalBindingSecret: env.AUTH_ADMIN_SECRET,
	});
}
