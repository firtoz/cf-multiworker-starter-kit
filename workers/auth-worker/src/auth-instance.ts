import type { Auth } from "./auth";

type AuthInstanceCache = {
	originsKey: string;
	auth: Auth;
};

let cache: AuthInstanceCache | null = null;

/** Reuse Better Auth instance per isolate when trusted origins are unchanged. */
export function getOrCreateAuth(
	trustedOrigins: string[],
	create: (origins: string[]) => Auth,
): Auth {
	const originsKey = trustedOrigins.join("\0");
	if (cache?.originsKey === originsKey) {
		return cache.auth;
	}
	const auth = create(trustedOrigins);
	cache = { originsKey, auth };
	return auth;
}

export function bustAuthInstanceCache(): void {
	cache = null;
}
