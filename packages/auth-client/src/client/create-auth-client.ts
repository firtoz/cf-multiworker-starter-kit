import { createBindingAuthWorkerHonoClient } from "../binding/create-binding-hono-client";
import { type AuthSession, isAdminUser } from "../roles";
import { getSession } from "../session";
import { createAccountApi } from "./account-api";
import { createAdminApi } from "./admin-api";
import { createProfileApi } from "./profile-api";

export type AuthClientOptions = {
	/** When set (e.g. from web worker root route middleware), skips a service-binding `get-session` call. */
	session?: AuthSession | null;
	/** With `session`, mints a trusted internal token so auth-worker custom routes skip D1 `getSession`. */
	internalBindingSecret?: string;
};

export type AuthClient = ReturnType<typeof createAuthClient>;

/** Server-side auth client: session reads + typed auth-worker API over service binding. */
export function createAuthClient(auth: Fetcher, request: Request, options?: AuthClientOptions) {
	const hono = createBindingAuthWorkerHonoClient(auth, request, {
		session: options?.session,
		internalBindingSecret: options?.internalBindingSecret,
	});
	const preloadedSession = options?.session;

	async function resolveSession(): Promise<AuthSession | null> {
		if (preloadedSession !== undefined) {
			return preloadedSession;
		}
		return getSession(auth, request);
	}

	return {
		session: {
			get: (): Promise<AuthSession | null> => resolveSession(),
			requireAdmin: async (): Promise<AuthSession | null> => {
				const session = await resolveSession();
				if (!session || !isAdminUser(session.user)) {
					return null;
				}
				return session;
			},
		},
		admin: createAdminApi(hono.admin),
		account: createAccountApi(hono.account),
		profile: createProfileApi(hono.profile),
		hono,
	};
}
