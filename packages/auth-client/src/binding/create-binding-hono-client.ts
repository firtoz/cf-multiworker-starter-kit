import { buildAuthBindingHeaders } from "../binding-headers";
import { createAuthBindingFetch } from "./auth-binding-fetch";
import { type AuthWorkerHonoClient, createAuthWorkerHonoClient } from "./auth-worker-hono-client";

export function createBindingAuthWorkerHonoClient(
	auth: Fetcher,
	request: Request,
): AuthWorkerHonoClient {
	return createAuthWorkerHonoClient(createAuthBindingFetch(auth, buildAuthBindingHeaders(request)));
}

export function createBindingAuthWorkerHonoClientWithHeaders(
	auth: Fetcher,
	headers: Headers,
): AuthWorkerHonoClient {
	return createAuthWorkerHonoClient(createAuthBindingFetch(auth, headers));
}
