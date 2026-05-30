import { safeRedirectPath } from "~/lib/safe-redirect-path";

/** Absolute post-auth URL on the current browser origin (Portless-safe; do not use SSR `request.url`). */
export function authCallbackUrl(path: string): string {
	const safe = safeRedirectPath(path, "/");
	return `${window.location.origin}${safe}`;
}
