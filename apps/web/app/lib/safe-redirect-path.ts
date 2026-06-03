/**
 * Allow only same-app relative paths for post-login redirects.
 * Rejects absolute URLs, protocol-relative paths (`//evil.com`), and backslash tricks.
 */
export function safeRedirectPath(raw: string | null | undefined, fallback: string): string {
	const trimmed = raw?.trim();
	if (!trimmed) {
		return fallback;
	}
	if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\")) {
		return fallback;
	}
	try {
		const url = new URL(trimmed, "http://local.invalid");
		if (url.origin !== "http://local.invalid" || url.username || url.password) {
			return fallback;
		}
	} catch {
		return fallback;
	}
	return trimmed;
}
