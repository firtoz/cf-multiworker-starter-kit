/**
 * Headers for `AUTH.fetch` service-binding calls.
 *
 * - Better Auth validates `Origin` on non-GET routes when a `Cookie` header is present.
 * - Behind Portless, `request.url` is often the Vite bind URL (`http://127.0.0.1:5173`) while the
 *   browser uses `https://<prefix>-web.localhost` — use `Host` / `X-Forwarded-*` for `Origin`.
 * - Third-party cookies (e.g. PostHog) must not be forwarded; they trigger CSRF checks without helping auth.
 */
export function isBetterAuthCookieName(name: string): boolean {
	return name.includes("better-auth");
}

/** Keep only Better Auth session cookies for service-binding calls. */
export function filterAuthCookieHeader(cookieHeader: string | null): string | null {
	if (!cookieHeader) {
		return null;
	}
	const kept: string[] = [];
	for (const part of cookieHeader.split(";")) {
		const trimmed = part.trim();
		if (!trimmed) {
			continue;
		}
		const eq = trimmed.indexOf("=");
		const name = eq > 0 ? trimmed.slice(0, eq).trim() : trimmed;
		if (isBetterAuthCookieName(name)) {
			kept.push(trimmed);
		}
	}
	return kept.length > 0 ? kept.join("; ") : null;
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
