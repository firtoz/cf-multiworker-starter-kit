import { env } from "cloudflare:workers";
import type { EnsureChatSessionResult } from "@internal/auth-client";
import { createAuthClient, ensureChatSession } from "@internal/auth-client";
import { createContext, type RouterContextProvider } from "react-router";
import { routeAuthClientContext } from "./route-auth-client";
import { setResolvedAuthSession } from "./route-context";

export const chatSessionContext = createContext<EnsureChatSessionResult | null>(null);

export async function resolveRouteChatSession({
	request,
	context,
}: {
	request: Request;
	context: Readonly<RouterContextProvider>;
}): Promise<EnsureChatSessionResult | null> {
	const existing = context.get(chatSessionContext);
	if (existing) {
		return existing;
	}

	const ensured = await ensureChatSession(env.AUTH, request);
	context.set(chatSessionContext, ensured);
	if (ensured) {
		setResolvedAuthSession(context, ensured.session);
		context.set(
			routeAuthClientContext,
			createAuthClient(env.AUTH, request, {
				session: ensured.session,
				internalBindingSecret: env.AUTH_ADMIN_SECRET,
			}),
		);
	}
	return ensured;
}

export const ensureChatSessionMiddleware = async (args: {
	request: Request;
	context: Readonly<RouterContextProvider>;
}): Promise<void> => {
	await resolveRouteChatSession(args);
};
