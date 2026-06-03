import { AUTH_ADMIN_SECRET_HEADER } from "@internal/auth-db/constants";
import { createBindingAuthWorkerHonoClientWithHeaders } from "../binding/create-binding-hono-client";
import { createAdminApi } from "./admin-api";

export type ServiceAuthClient = ReturnType<typeof createServiceAuthClient>;

/** Machine admin client (`AUTH_ADMIN_SECRET`) for automation without a browser session. */
export function createServiceAuthClient(auth: Fetcher, secret: string) {
	const headers = new Headers();
	headers.set(AUTH_ADMIN_SECRET_HEADER, secret);
	const hono = createBindingAuthWorkerHonoClientWithHeaders(auth, headers);

	return {
		admin: createAdminApi(hono.admin),
		hono,
	};
}
