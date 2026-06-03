import {
	authEmailSignInBodySchema,
	authEmailSignUpBodySchema,
	authLinkSocialBodySchema,
	authSocialSignInBodySchema,
	type BetterAuthGetSessionResponse,
	betterAuthGetSessionResponseSchema,
	betterAuthSessionOkResponseSchema,
	betterAuthSignOutResponseSchema,
} from "@internal/auth-db/api-schemas";
import { parseAuthRole } from "@internal/auth-db/roles";
import { Hono } from "hono";
import type { AuthWorkerAppEnv } from "./app-env";
import { authApiErrorResponse, callAuthApi } from "./auth-api-hono";
import { authProviderFlags } from "./auth-provider-flags";
import { jsonValidator } from "./hono-zod";

export const betterAuthPath = "/api/auth" as const;

function getSessionQueryFromRequest(url: string) {
	const params = new URL(url).searchParams;
	const query: {
		disableCookieCache?: boolean;
		disableRefresh?: boolean;
	} = {};
	if (params.has("disableCookieCache")) {
		query.disableCookieCache = params.get("disableCookieCache") === "true";
	}
	if (params.has("disableRefresh")) {
		query.disableRefresh = params.get("disableRefresh") === "true";
	}
	return query;
}

function getSessionResponse(
	session: AuthWorkerAppEnv["Variables"]["authSession"],
): BetterAuthGetSessionResponse {
	if (!session) {
		return null;
	}
	const name = session.user.name?.trim();
	const image = session.user.image?.trim();
	return betterAuthGetSessionResponseSchema.parse({
		user: {
			id: session.user.id,
			email: session.user.email,
			role: parseAuthRole(session.user.role),
			...(name ? { name } : {}),
			...(image ? { image } : {}),
			...(session.user.isAnonymous === true ? { isAnonymous: true } : {}),
		},
		session: {
			id: session.session.id,
			expiresAt:
				session.session.expiresAt instanceof Date
					? session.session.expiresAt.toISOString()
					: String(session.session.expiresAt),
		},
	});
}

function applyHeaders<T extends Response>(response: T, headers: Headers): T {
	headers.forEach((value, key) => {
		if (key.toLowerCase() === "set-cookie") {
			response.headers.append(key, value);
			return;
		}
		response.headers.set(key, value);
	});
	return response;
}

function authErrorOrThrow(error: unknown): Response {
	const response = authApiErrorResponse(error);
	if (response) {
		return response;
	}
	throw error;
}

/** Better Auth HTTP API + app-specific `/api/auth/providers`. */
export const betterAuth = new Hono<AuthWorkerAppEnv>()
	.get("/providers", (c) => c.json(authProviderFlags(c.env)))
	.get("/get-session", async (c) => {
		const query = getSessionQueryFromRequest(c.req.url);
		const { headers, response } = await c.var.auth.api.getSession({
			headers: c.req.raw.headers,
			...(Object.keys(query).length > 0 ? { query } : {}),
			returnHeaders: true,
		});
		return applyHeaders(c.json(getSessionResponse(response)), headers);
	})
	.post("/sign-in/anonymous", async (c) => {
		try {
			const { headers, response } = await c.var.auth.api.signInAnonymous({
				headers: c.req.raw.headers,
				returnHeaders: true,
			});
			return applyHeaders(c.json(betterAuthSessionOkResponseSchema.parse(response)), headers);
		} catch (error) {
			return authErrorOrThrow(error);
		}
	})
	.post("/sign-out", async (c) => {
		try {
			const { headers, response } = await c.var.auth.api.signOut({
				headers: c.req.raw.headers,
				returnHeaders: true,
			});
			return applyHeaders(c.json(betterAuthSignOutResponseSchema.parse(response)), headers);
		} catch (error) {
			return authErrorOrThrow(error);
		}
	})
	.post("/sign-in/email", jsonValidator(authEmailSignInBodySchema), async (c) => {
		const body = c.req.valid("json");
		try {
			const { headers, response } = await c.var.auth.api.signInEmail({
				body,
				headers: c.req.raw.headers,
				returnHeaders: true,
			});
			return applyHeaders(c.json(betterAuthSessionOkResponseSchema.parse(response)), headers);
		} catch (error) {
			return authErrorOrThrow(error);
		}
	})
	.post("/sign-up/email", jsonValidator(authEmailSignUpBodySchema), async (c) => {
		const body = c.req.valid("json");
		try {
			const { headers, response } = await c.var.auth.api.signUpEmail({
				body,
				headers: c.req.raw.headers,
				returnHeaders: true,
			});
			return applyHeaders(c.json(betterAuthSessionOkResponseSchema.parse(response)), headers);
		} catch (error) {
			return authErrorOrThrow(error);
		}
	})
	.post("/sign-in/social", jsonValidator(authSocialSignInBodySchema), async (c) => {
		const body = c.req.valid("json");
		try {
			const { headers, response } = await c.var.auth.api.signInSocial({
				body,
				headers: c.req.raw.headers,
				returnHeaders: true,
			});
			return applyHeaders(c.json(betterAuthSessionOkResponseSchema.parse(response)), headers);
		} catch (error) {
			return authErrorOrThrow(error);
		}
	})
	.post("/link-social", jsonValidator(authLinkSocialBodySchema), async (c) => {
		const body = c.req.valid("json");
		try {
			const { headers, response } = await c.var.auth.api.linkSocialAccount({
				body,
				headers: c.req.raw.headers,
				returnHeaders: true,
			});
			return applyHeaders(c.json(betterAuthSessionOkResponseSchema.parse(response)), headers);
		} catch (error) {
			return authErrorOrThrow(error);
		}
	})
	.get("/callback/:id", (c) => {
		const query = Object.fromEntries(new URL(c.req.url).searchParams.entries());
		return callAuthApi(c, (api) =>
			api.callbackOAuth({
				params: { id: c.req.param("id") },
				query,
				headers: c.req.raw.headers,
				request: c.req.raw,
				asResponse: true,
			}),
		);
	})
	.get("/oauth-proxy-callback", (c) => {
		type OAuthProxyHandler = (input: {
			query: { callbackURL: string; profile?: string };
			headers: Headers;
			request: Request;
			asResponse: true;
		}) => Promise<Response>;
		const oAuthProxy = (c.var.auth.api as { oAuthProxy?: OAuthProxyHandler }).oAuthProxy;
		if (typeof oAuthProxy !== "function") {
			return c.notFound();
		}
		const url = new URL(c.req.url);
		const callbackURL = url.searchParams.get("callbackURL");
		if (!callbackURL) {
			return c.text("Missing callbackURL", 400);
		}
		const profileParam = url.searchParams.get("profile");
		return callAuthApi(c, () =>
			oAuthProxy({
				query: {
					callbackURL,
					...(profileParam ? { profile: profileParam } : {}),
				},
				headers: c.req.raw.headers,
				request: c.req.raw,
				asResponse: true,
			}),
		);
	});

export type BetterAuthApp = typeof betterAuth;
