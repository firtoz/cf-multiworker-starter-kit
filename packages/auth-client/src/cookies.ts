/** Merge `Set-Cookie` values into a `Cookie` request header for a follow-up service binding call. */
export function cookieHeaderAfterSetCookie(
	incoming: string | null,
	setCookies: string[],
): string | null {
	const jar = new Map<string, string>();

	for (const part of (incoming ?? "").split(";")) {
		const trimmed = part.trim();
		if (!trimmed) {
			continue;
		}
		const eq = trimmed.indexOf("=");
		if (eq <= 0) {
			continue;
		}
		jar.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
	}

	for (const setCookie of setCookies) {
		const pair = setCookie.split(";")[0]?.trim();
		if (!pair) {
			continue;
		}
		const eq = pair.indexOf("=");
		if (eq <= 0) {
			continue;
		}
		jar.set(pair.slice(0, eq), pair.slice(eq + 1));
	}

	if (jar.size === 0) {
		return incoming;
	}
	return Array.from(jar, ([k, v]) => `${k}=${v}`).join("; ");
}

export function collectSetCookieHeaders(response: Response): string[] {
	if (typeof response.headers.getSetCookie === "function") {
		return response.headers.getSetCookie();
	}
	const single = response.headers.get("set-cookie");
	return single ? [single] : [];
}
