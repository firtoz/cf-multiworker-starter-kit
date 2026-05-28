import { AUTH_INTERNAL_ORIGIN } from "../constants";

/** Service-binding fetcher for auth-worker Hono routes (`https://auth.internal` + path). */
export function createAuthBindingFetch(auth: Fetcher, baseHeaders: Headers) {
	return (path: string, init?: RequestInit) => {
		const headers = new Headers(init?.headers);
		for (const [key, value] of baseHeaders) {
			headers.set(key, value);
		}
		return auth.fetch(new Request(`${AUTH_INTERNAL_ORIGIN}${path}`, { ...init, headers }));
	};
}
