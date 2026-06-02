/** React Router client `.data` loader requests (not full document navigations). */
export function isReactRouterDataRequest(request: Request): boolean {
	const { pathname } = new URL(request.url);
	return pathname.endsWith(".data") || pathname.endsWith("/_.data");
}
