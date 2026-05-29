import { isAPIError } from "better-auth/api";
import type { Context } from "hono";
import type { AuthWorkerAppEnv } from "./app-env";
import type { Auth } from "./auth";

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
			return new Response(JSON.stringify({ message: error.message, ...error.body }), {
				status: error.statusCode,
				headers: { "content-type": "application/json" },
			});
		}
		throw error;
	}
}
