import { createAuthBindingFetch } from "../binding/auth-binding-fetch";
import { AUTH_ADMIN_SECRET_HEADER } from "../constants";
import { createAdminApi } from "./admin-api";

export type ServiceAuthClient = ReturnType<typeof createServiceAuthClient>;

/** Machine admin client (`AUTH_ADMIN_SECRET`) for automation without a browser session. */
export function createServiceAuthClient(auth: Fetcher, secret: string) {
	const headers = new Headers();
	headers.set(AUTH_ADMIN_SECRET_HEADER, secret);
	const fetch = createAuthBindingFetch(auth, headers);

	return {
		fetch,
		admin: createAdminApi(fetch),
	};
}

export type { AuthBindingFetch } from "./admin-api";
