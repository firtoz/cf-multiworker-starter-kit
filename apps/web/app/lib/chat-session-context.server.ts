import { env } from "cloudflare:workers";
import { createAuthClient } from "@internal/auth-client/client";
import { createContext, type RouterContextProvider } from "react-router";
import { type EnsureChatSessionResult, ensureChatSession } from "./ensure-chat-session.server";
import { routeAuthClientContext } from "./route-auth-client.server";
import { setResolvedAuthSession } from "./route-context.server";

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
