import type { AuthSession } from "@internal/auth-client/roles";
import { createContext, type RouterContextProvider } from "react-router";

export type AuthSessionResolver = () => Promise<AuthSession | null>;

/** Lazy document session resolver installed once per request in root route middleware. */
export const authSessionResolverContext = createContext<AuthSessionResolver | null>(null);

type AuthSessionState = { status: "pending" } | { status: "resolved"; session: AuthSession | null };

/** Document session state after it has been resolved by auth-aware routes or middleware. */
const authSessionStateContext = createContext<AuthSessionState>({ status: "pending" });

/** Set by signed-in route middleware after it redirects missing or guest sessions. */
export const signedInAuthSessionContext = createContext<AuthSession>();

/** Set by admin route middleware after it redirects non-admin sessions. */
export const adminAuthSessionContext = createContext<AuthSession>();

export async function resolveAuthSession(
	context: Readonly<RouterContextProvider>,
): Promise<AuthSession | null> {
	const state = context.get(authSessionStateContext);
	if (state.status === "resolved") {
		return state.session;
	}

	const resolver = context.get(authSessionResolverContext);
	if (!resolver) {
		return null;
	}

	const session = await resolver();
	setResolvedAuthSession(context, session);
	return session;
}

export function setResolvedAuthSession(
	context: Readonly<RouterContextProvider>,
	session: AuthSession | null,
): void {
	context.set(authSessionStateContext, { status: "resolved", session });
}

export function readAuthSession(context: Readonly<RouterContextProvider>): AuthSession | null {
	const state = context.get(authSessionStateContext);
	return state.status === "resolved" ? state.session : null;
}
