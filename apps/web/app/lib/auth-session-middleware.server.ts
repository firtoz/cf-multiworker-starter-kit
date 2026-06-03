import { env } from "cloudflare:workers";
import { resolveDocumentAuthSession } from "@internal/auth-client/session";
import type { RouterContextProvider } from "react-router";
import { authSessionResolverContext } from "./route-context.server";

type DocumentAuthSessionResult = Awaited<ReturnType<typeof resolveDocumentAuthSession>>;

/**
 * Share the same in-flight session lookup across nested router middleware and loaders.
 * React Router can invoke multiple auth-aware paths for one request, so request-scoped memoization
 * keeps them from fanning out to duplicate `get-session` calls.
 */
const documentAuthSessionPromises = new WeakMap<Request, Promise<DocumentAuthSessionResult>>();

export async function runAuthSessionMiddleware(
	request: Request,
	context: Readonly<RouterContextProvider>,
	next: () => Promise<Response>,
): Promise<Response> {
	let staleCookieHeaders: string[] = [];

	context.set(authSessionResolverContext, async () => {
		let sessionPromise = documentAuthSessionPromises.get(request);
		if (!sessionPromise) {
			sessionPromise = resolveDocumentAuthSession(env.AUTH, request);
			documentAuthSessionPromises.set(request, sessionPromise);
		}
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
