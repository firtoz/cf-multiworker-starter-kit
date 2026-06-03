import type { AuthSession } from "./roles";
import { getSession } from "./session";

/** React Router root middleware populates session once per document/data request on the web worker. */
export type AuthLoaderContext = {
	authSession?: AuthSession | null;
};

/**
 * Use in route loaders/actions instead of calling {@link getSession} again when the web worker
 * already resolved the session for this HTTP request.
 */
export async function resolveAuthSession(
	context: AuthLoaderContext,
	auth: Fetcher,
	request: Request,
): Promise<AuthSession | null> {
	if (context.authSession !== undefined) {
		return context.authSession;
	}
	return getSession(auth, request);
}
