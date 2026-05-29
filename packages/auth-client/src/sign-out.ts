import { createBindingAuthWorkerHonoClient } from "./binding/create-binding-hono-client";
import { collectSetCookieHeaders } from "./cookies";

/** Clears the Better Auth session; forward returned `Set-Cookie` headers on the document response. */
export async function signOut(auth: Fetcher, request: Request): Promise<string[]> {
	const api = createBindingAuthWorkerHonoClient(auth, request);
	const res = await api.betterAuth.post({ url: "/sign-out" });
	return collectSetCookieHeaders(res);
}
