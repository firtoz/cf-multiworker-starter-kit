import { createBindingAuthWorkerHonoClient } from "../binding/create-binding-hono-client";
import { type EnsureChatSessionResult, ensureChatSession } from "../chat-session";
import type { AuthSession } from "../roles";
import { getSession, requireAdmin } from "../session";
import { createAccountApi } from "./account-api";
import { createAdminApi } from "./admin-api";
import { createProfileApi } from "./profile-api";

export type AuthClient = ReturnType<typeof createAuthClient>;

/** Server-side auth client: session reads + typed auth-worker API over service binding. */
export function createAuthClient(auth: Fetcher, request: Request) {
	const hono = createBindingAuthWorkerHonoClient(auth, request);
	return {
		session: {
			get: (): Promise<AuthSession | null> => getSession(auth, request),
			requireAdmin: (): Promise<AuthSession | null> => requireAdmin(auth, request),
			ensureChat: (): Promise<EnsureChatSessionResult | null> => ensureChatSession(auth, request),
		},
		admin: createAdminApi(hono.admin),
		account: createAccountApi(hono.account),
		profile: createProfileApi(hono.profile),
		hono,
	};
}
