import type { AuthSession } from "./roles";
import { getSession } from "./session";

/** React Router `AppLoadContext` slice populated once per document request in the web worker. */
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
