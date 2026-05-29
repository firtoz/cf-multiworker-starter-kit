import { createBindingAuthWorkerHonoClient } from "./binding/create-binding-hono-client";
import { buildAuthBindingHeaders } from "./binding-headers";
import { collectSetCookieHeaders, cookieHeaderAfterSetCookie } from "./cookies";
import type { AuthSession } from "./roles";
import { getSession } from "./session";

export type EnsureChatSessionResult = {
	session: AuthSession;
	setCookieHeaders: string[];
};

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

	const api = createBindingAuthWorkerHonoClient(auth, request);
	const signInRes = await api.betterAuth.post({ url: "/sign-in/anonymous" });
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
