import {
	createInternalBindingSessionToken,
	INTERNAL_BINDING_SESSION_HEADER,
} from "@internal/auth-db/internal-binding-session";
import { buildAuthBindingHeaders } from "../binding-headers";
import type { AuthSession } from "../roles";
import { createAuthBindingFetch } from "./auth-binding-fetch";
import { type AuthWorkerHonoClient, createAuthWorkerHonoClient } from "./auth-worker-hono-client";

export type BindingAuthWorkerClientOptions = {
	/** Preloaded session from the web worker — skips binding `get-session` when paired with `internalBindingSecret`. */
	session?: AuthSession | null | undefined;
	/** Shared secret (`AUTH_ADMIN_SECRET`) to mint trusted internal session tokens on binding calls. */
	internalBindingSecret?: string | undefined;
};

export function createBindingAuthWorkerHonoClient(
	auth: Fetcher,
	request: Request,
	options?: BindingAuthWorkerClientOptions,
): AuthWorkerHonoClient {
	const getHeaders = async () => {
		const headers = buildAuthBindingHeaders(request);
		if (options?.session && options.internalBindingSecret) {
			headers.set(
				INTERNAL_BINDING_SESSION_HEADER,
				await createInternalBindingSessionToken(options.session, options.internalBindingSecret),
			);
		}
		return headers;
	};
	return createAuthWorkerHonoClient(createAuthBindingFetch(auth, getHeaders));
}

export function createBindingAuthWorkerHonoClientWithHeaders(
	auth: Fetcher,
	headers: Headers,
): AuthWorkerHonoClient {
	return createAuthWorkerHonoClient(createAuthBindingFetch(auth, headers));
}
