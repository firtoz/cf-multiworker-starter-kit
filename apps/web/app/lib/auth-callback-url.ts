/** Absolute post-auth URL on the current browser origin (Portless-safe; do not use SSR `request.url`). */
export function authCallbackUrl(path: string): string {
	return `${window.location.origin}${path.startsWith("/") ? path : `/${path}`}`;
}
