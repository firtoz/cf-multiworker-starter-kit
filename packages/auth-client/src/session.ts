import { buildAuthBindingHeaders } from "./binding-headers";
import { AUTH_GET_SESSION_PATH, AUTH_INTERNAL_ORIGIN, AUTH_PROVIDERS_PATH } from "./constants";
import { type AuthSession, type AuthUser, isAdminUser, parseAuthRole } from "./roles";

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
	const headers = buildAuthBindingHeaders(request);
	const sessionUrl = `${AUTH_INTERNAL_ORIGIN}${AUTH_GET_SESSION_PATH}`;

	let res = await auth.fetch(new Request(sessionUrl, { headers }));
	for (let attempt = 0; res.status === 503 && attempt < 2; attempt++) {
		res = await auth.fetch(new Request(sessionUrl, { headers }));
	}

	if (!res.ok) {
		return null;
	}
	const body = (await res.json()) as GetSessionResponse | null;
	return mapSession(body);
}

export type AuthProviders = {
	google: boolean;
	github: boolean;
	email: boolean;
	/** Local Portless: OAuth redirect uses loopback via Better Auth `oAuthProxy`. */
	googleLoopbackOAuthProxy?: boolean;
};

export async function getAuthProviders(auth: Fetcher): Promise<AuthProviders> {
	const res = await auth.fetch(new Request(`${AUTH_INTERNAL_ORIGIN}${AUTH_PROVIDERS_PATH}`));
	if (!res.ok) {
		return { google: false, github: false, email: true };
	}
	return (await res.json()) as AuthProviders;
}

export async function requireAdmin(auth: Fetcher, request: Request): Promise<AuthSession | null> {
	const session = await getSession(auth, request);
	if (!session || !isAdminUser(session.user)) {
		return null;
	}
	return session;
}
