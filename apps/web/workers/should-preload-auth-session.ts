const STATIC_PATH_PREFIXES = ["/assets/", "/favicon.ico"] as const;

const STATIC_FILE_EXTENSION = /\.(css|js|mjs|map|woff2?|ttf|eot|svg|png|jpe?g|gif|webp|ico|json)$/i;

/** Skip one `getSession` binding hop for built assets and other non-document requests. */
export function shouldPreloadAuthSession(pathname: string): boolean {
	if (STATIC_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix))) {
		return false;
	}
	return !STATIC_FILE_EXTENSION.test(pathname);
}
