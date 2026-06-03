import {
	createBindingAuthWorkerHonoClient,
	createBindingAuthWorkerHonoClientWithHeaders,
} from "./binding/create-binding-hono-client";
import { filterAuthCookieHeader } from "./binding-headers";
import { isReactRouterDataRequest } from "./document-request";
import { type AuthSession, isAdminUser } from "./roles";
import { signOut } from "./sign-out";

export type GetSessionOptions = {
	/** Bypass Better Auth cookie cache (document loads). Defaults from request type when omitted. */
	disableCookieCache?: boolean;
};

function resolveDisableCookieCache(request: Request, options?: GetSessionOptions): boolean {
	return options?.disableCookieCache ?? !isReactRouterDataRequest(request);
}

export async function getSession(
	auth: Fetcher,
	request: Request,
	options?: GetSessionOptions,
): Promise<AuthSession | null> {
	const api = createBindingAuthWorkerHonoClient(auth, request);
	const disableCookieCache = resolveDisableCookieCache(request, options);

	let res = await api.betterAuth.get({
		url: "/get-session",
		query: { disableCookieCache },
	});
	for (let attempt = 0; res.status === 503 && attempt < 2; attempt++) {
		res = await api.betterAuth.get({
			url: "/get-session",
			query: { disableCookieCache },
		});
	}

	if (!res.ok) {
		return null;
	}
	return res.json();
}

/** Document preload: DB-backed session; clears stale browser cookies when revoked elsewhere. */
export async function resolveDocumentAuthSession(
	auth: Fetcher,
	request: Request,
): Promise<{ session: AuthSession | null; staleCookieHeaders: string[] }> {
	const isDataRequest = isReactRouterDataRequest(request);
	const session = await getSession(auth, request, { disableCookieCache: !isDataRequest });
	if (session) {
		return { session, staleCookieHeaders: [] };
	}
	if (isDataRequest || !filterAuthCookieHeader(request.headers.get("cookie"))) {
		return { session: null, staleCookieHeaders: [] };
	}
	return { session: null, staleCookieHeaders: await signOut(auth, request) };
}

export type AuthProviders = {
	google: boolean;
	github: boolean;
	email: boolean;
	oauthProxy?: boolean;
	oauthProxyPassthrough?: boolean;
	googleLoopbackOAuthProxy?: boolean;
};

export async function getAuthProviders(auth: Fetcher): Promise<AuthProviders> {
	const api = createBindingAuthWorkerHonoClientWithHeaders(auth, new Headers());
	const res = await api.betterAuth.get({ url: "/providers" });
	if (!res.ok) {
		return { google: false, github: false, email: true };
	}
	return res.json();
}

export async function requireAdmin(auth: Fetcher, request: Request): Promise<AuthSession | null> {
	const session = await getSession(auth, request);
	if (!session || !isAdminUser(session.user)) {
		return null;
	}
	return session;
}
