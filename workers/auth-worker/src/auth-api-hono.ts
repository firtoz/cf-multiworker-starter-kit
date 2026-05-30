import { isAPIError } from "better-auth/api";
import type { Context } from "hono";
import type { AuthWorkerAppEnv } from "./app-env";
import type { Auth } from "./auth";

/** Same symbol as better-call `kAPIErrorHeaderSymbol` (ctx.setHeader cookies before redirect throw). */
const kApiErrorHeaderSymbol = Symbol.for("better-call:api-error-headers");

function mergeApiErrorHeaders(error: {
	headers?: HeadersInit;
	[kApiErrorHeaderSymbol]?: Headers;
}): Headers {
	const headers = new Headers(error.headers);
	const ctxHeaders = error[kApiErrorHeaderSymbol];
	if (ctxHeaders) {
		ctxHeaders.forEach((value, key) => {
			if (key.toLowerCase() === "set-cookie") {
				headers.append(key, value);
			} else {
				headers.set(key, value);
			}
		});
	}
	return headers;
}

/** Invoke Better Auth `auth.api.*` and return an HTTP `Response` (cookies, redirects, JSON). */
export async function callAuthApi(
	c: Context<AuthWorkerAppEnv>,
	invoke: (api: Auth["api"]) => Promise<unknown>,
): Promise<Response> {
	try {
		const result = await invoke(c.var.auth.api);
		if (result instanceof Response) {
			return result;
		}
		return c.json(result ?? null);
	} catch (error) {
		if (isAPIError(error)) {
			const headers = mergeApiErrorHeaders(
				error as typeof error & { [kApiErrorHeaderSymbol]?: Headers },
			);
			const status = error.statusCode;
			// OAuth before-hooks (e.g. oAuthProxy staging callback) throw redirect APIErrors.
			if (status >= 300 && status < 400) {
				return new Response(null, { status, headers });
			}
			headers.set("content-type", "application/json");
			return new Response(JSON.stringify({ message: error.message, ...error.body }), {
				status,
				headers,
			});
		}
		throw error;
	}
}
