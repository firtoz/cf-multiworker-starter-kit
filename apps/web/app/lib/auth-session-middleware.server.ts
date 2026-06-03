import { env } from "cloudflare:workers";
import { resolveDocumentAuthSession } from "@internal/auth-client/session";
import type { RouterContextProvider } from "react-router";
import { authSessionResolverContext } from "./route-context.server";

type DocumentAuthSessionResult = Awaited<ReturnType<typeof resolveDocumentAuthSession>>;

export async function runAuthSessionMiddleware(
	request: Request,
	context: Readonly<RouterContextProvider>,
	next: () => Promise<Response>,
): Promise<Response> {
	let staleCookieHeaders: string[] = [];
	let sessionPromise: Promise<DocumentAuthSessionResult> | undefined;

	context.set(authSessionResolverContext, async () => {
		sessionPromise ??= resolveDocumentAuthSession(env.AUTH, request);
		const { session, staleCookieHeaders: headers } = await sessionPromise;
		staleCookieHeaders = headers;
		return session;
	});

	const response = await next();
	if (staleCookieHeaders.length === 0) {
		return response;
	}

	const headers = new Headers(response.headers);
	for (const cookie of staleCookieHeaders) {
		headers.append("Set-Cookie", cookie);
	}
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}
