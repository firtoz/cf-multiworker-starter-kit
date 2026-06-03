import { env } from "cloudflare:workers";
import { type AuthClient, createAuthClient } from "@internal/auth-client/client";
import { createContext, type RouterContextProvider } from "react-router";
import { resolveAuthSession } from "./route-context.server";

export const routeAuthClientContext = createContext<AuthClient>();

export async function routeAuthClientMiddleware({
	request,
	context,
}: {
	request: Request;
	context: Readonly<RouterContextProvider>;
}): Promise<void> {
	const auth = createAuthClient(env.AUTH, request, {
		session: await resolveAuthSession(context),
		internalBindingSecret: env.AUTH_ADMIN_SECRET,
	});
	context.set(routeAuthClientContext, auth);
}
