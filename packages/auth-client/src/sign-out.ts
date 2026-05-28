import { buildAuthBindingHeaders } from "./binding-headers";
import { AUTH_INTERNAL_ORIGIN, AUTH_SIGN_OUT_PATH } from "./constants";
import { collectSetCookieHeaders } from "./cookies";

/** Clears the Better Auth session; forward returned `Set-Cookie` headers on the document response. */
export async function signOut(auth: Fetcher, request: Request): Promise<string[]> {
	const headers = buildAuthBindingHeaders(request);
	const res = await auth.fetch(
		new Request(`${AUTH_INTERNAL_ORIGIN}${AUTH_SIGN_OUT_PATH}`, {
			method: "POST",
			headers,
		}),
	);
	return collectSetCookieHeaders(res);
}
