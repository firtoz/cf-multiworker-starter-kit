import { parseAuthRole } from "@internal/auth-db/roles";
import {
	createBindingAuthWorkerHonoClient,
	createBindingAuthWorkerHonoClientWithHeaders,
} from "./binding/create-binding-hono-client";
import { filterAuthCookieHeader } from "./binding-headers";
import { type AuthSession, type AuthUser, isAdminUser } from "./roles";
import { signOut } from "./sign-out";

type GetSessionResponse = {
	user?: {
		id: string;
		email: string;
		name?: string | null;
		image?: string | null;
		role?: string;
		isAnonymous?: boolean | null;
	};
	session?: {
		id: string;
		expiresAt: string | Date;
	};
};

function mapSession(body: GetSessionResponse | null): AuthSession | null {
	if (body == null || typeof body !== "object" || !body.user || !body.session) {
		return null;
	}
	const expiresAt =
		body.session.expiresAt instanceof Date
			? body.session.expiresAt.toISOString()
			: String(body.session.expiresAt);
	const user: AuthUser = {
		id: body.user.id,
		email: body.user.email,
		role: parseAuthRole(body.user.role),
		...(body.user.name != null && body.user.name !== "" ? { name: body.user.name } : {}),
		...(body.user.image != null && body.user.image !== "" ? { image: body.user.image } : {}),
		...(body.user.isAnonymous === true ? { isAnonymous: true } : {}),
	};
	return {
		user,
		session: { id: body.session.id, expiresAt },
	};
}

export async function getSession(auth: Fetcher, request: Request): Promise<AuthSession | null> {
	const api = createBindingAuthWorkerHonoClient(auth, request);

	let res = await api.betterAuth.get({
		url: "/get-session",
		query: { disableCookieCache: true },
	});
	for (let attempt = 0; res.status === 503 && attempt < 2; attempt++) {
		res = await api.betterAuth.get({
			url: "/get-session",
			query: { disableCookieCache: true },
		});
	}

	if (!res.ok) {
		return null;
	}
	return mapSession(await res.json());
}

/** Document preload: DB-backed session; clears stale browser cookies when revoked elsewhere. */
export async function resolveDocumentAuthSession(
	auth: Fetcher,
	request: Request,
): Promise<{ session: AuthSession | null; staleCookieHeaders: string[] }> {
	const session = await getSession(auth, request);
	if (session) {
		return { session, staleCookieHeaders: [] };
	}
	if (!filterAuthCookieHeader(request.headers.get("cookie"))) {
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
