import { buildAuthBindingHeaders } from "./binding-headers";
import { AUTH_INTERNAL_ORIGIN, AUTH_SIGN_IN_ANONYMOUS_PATH } from "./constants";
import { collectSetCookieHeaders, cookieHeaderAfterSetCookie } from "./cookies";
import type { AuthSession } from "./roles";
import { getSession } from "./session";

export type EnsureChatSessionResult = {
	session: AuthSession;
	/** Non-empty when a new anonymous session was created — forward on the document response. */
	setCookieHeaders: string[];
};

async function signInAnonymous(auth: Fetcher, request: Request): Promise<Response> {
	const headers = buildAuthBindingHeaders(request);
	return auth.fetch(
		new Request(`${AUTH_INTERNAL_ORIGIN}${AUTH_SIGN_IN_ANONYMOUS_PATH}`, {
			method: "POST",
			headers,
		}),
	);
}

function requestWithCookieHeader(pageRequest: Request, cookie: string | null): Request {
	const headers = buildAuthBindingHeaders(pageRequest);
	if (cookie) {
		headers.set("cookie", cookie);
	}
	return new Request(pageRequest.url, { headers });
}

/**
 * Ensures the browser has an auth session for chat (anonymous sign-in when logged out).
 * Call from the `/chat` loader so WebSocket attestation can use a stable `user.id`.
 */
export async function ensureChatSession(
	auth: Fetcher,
	request: Request,
): Promise<EnsureChatSessionResult | null> {
	const existing = await getSession(auth, request);

	if (existing) {
		return { session: existing, setCookieHeaders: [] };
	}

	const signInRes = await signInAnonymous(auth, request);
	if (!signInRes.ok) {
		return null;
	}

	const setCookieHeaders = collectSetCookieHeaders(signInRes);
	const mergedCookie = cookieHeaderAfterSetCookie(request.headers.get("cookie"), setCookieHeaders);

	const session = await getSession(auth, requestWithCookieHeader(request, mergedCookie));
	if (!session) {
		return null;
	}

	return { session, setCookieHeaders };
}
