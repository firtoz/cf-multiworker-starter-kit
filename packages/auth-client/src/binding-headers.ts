import { BETTER_AUTH_COOKIE_PREFIX } from "@internal/auth-db/constants";
import { parseCookies, SECURE_COOKIE_PREFIX } from "better-auth/cookies";

/** Whether a cookie name belongs to Better Auth (handles `__Secure-` and configured prefix). */
export function isBetterAuthCookieName(name: string): boolean {
	const bare = name.startsWith(SECURE_COOKIE_PREFIX)
		? name.slice(SECURE_COOKIE_PREFIX.length)
		: name;
	return (
		bare.startsWith(`${BETTER_AUTH_COOKIE_PREFIX}.`) ||
		bare.startsWith(`${BETTER_AUTH_COOKIE_PREFIX}-`)
	);
}

/** Keep only Better Auth session cookies for service-binding calls. */
export function filterAuthCookieHeader(cookieHeader: string | null): string | null {
	if (!cookieHeader) {
		return null;
	}
	const parts: string[] = [];
	for (const [name, value] of parseCookies(cookieHeader)) {
		if (isBetterAuthCookieName(name)) {
			parts.push(`${name}=${value}`);
		}
	}
	return parts.length > 0 ? parts.join("; ") : null;
}

/** Browser-facing origin for CSRF checks (Portless-aware). */
export function resolvePageOrigin(request: Request): string | null {
	try {
		const forwardedHost = request.headers.get("X-Forwarded-Host");
		const hostHeader =
			forwardedHost?.split(",")[0]?.trim() || request.headers.get("Host")?.split(",")[0]?.trim();
		if (hostHeader) {
			const forwardedProto = request.headers.get("X-Forwarded-Proto")?.split(",")[0]?.trim();
			const url = new URL(request.url);
			const proto =
				forwardedProto ||
				(url.protocol === "https:" ? "https" : url.protocol === "http:" ? "http" : "https");
			return `${proto}://${hostHeader}`;
		}
		return new URL(request.url).origin;
	} catch {
		return null;
	}
}

/**
 * Headers for `AUTH.fetch` service-binding calls.
 *
 * - Better Auth validates `Origin` on non-GET routes when a `Cookie` header is present.
 * - Behind Portless, `request.url` is often the Vite bind URL (`http://127.0.0.1:5173`) while the
 *   browser uses `https://<prefix>-web.localhost` — use `Host` / `X-Forwarded-*` for `Origin`.
 * - Third-party cookies (e.g. PostHog) must not be forwarded; they trigger CSRF checks without helping auth.
 */
export function buildAuthBindingHeaders(request: Request): Headers {
	const headers = new Headers();
	const authCookie = filterAuthCookieHeader(request.headers.get("cookie"));
	if (authCookie) {
		headers.set("cookie", authCookie);
	}
	const authorization = request.headers.get("authorization");
	if (authorization) {
		headers.set("authorization", authorization);
	}
	const origin = resolvePageOrigin(request);
	if (origin) {
		headers.set("Origin", origin);
	}
	return headers;
}
