import { safeRedirectPath } from "~/lib/safe-redirect-path";

/** Absolute post-auth URL on the current browser origin. Pass loader origin for SSR. */
export function authCallbackUrl(path: string, origin?: string): string {
	const safe = safeRedirectPath(path, "/");
	const base = origin ?? (typeof window === "undefined" ? "" : window.location.origin);
	return `${base}${safe}`;
}
