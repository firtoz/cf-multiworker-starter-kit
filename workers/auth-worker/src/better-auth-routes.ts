import {
	authEmailSignInBodySchema,
	authEmailSignUpBodySchema,
	authLinkSocialBodySchema,
	authSocialSignInBodySchema,
} from "@internal/auth-db/api-schemas";
import { Hono } from "hono";
import type { AuthWorkerAppEnv } from "./app-env";
import { callAuthApi } from "./auth-api-hono";
import { authProviderFlags } from "./auth-provider-flags";
import { jsonValidator } from "./hono-zod";

export const betterAuthPath = "/api/auth" as const;

/** Better Auth HTTP API + app-specific `/api/auth/providers`. */
export const betterAuth = new Hono<AuthWorkerAppEnv>()
	.get("/providers", (c) => c.json(authProviderFlags(c.env)))
	.get("/get-session", (c) =>
		callAuthApi(c, (api) =>
			api.getSession({
				headers: c.req.raw.headers,
				asResponse: true,
			}),
		),
	)
	.post("/sign-in/anonymous", (c) =>
		callAuthApi(c, (api) =>
			api.signInAnonymous({
				headers: c.req.raw.headers,
				asResponse: true,
			}),
		),
	)
	.post("/sign-out", (c) =>
		callAuthApi(c, (api) =>
			api.signOut({
				headers: c.req.raw.headers,
				asResponse: true,
			}),
		),
	)
	.post("/sign-in/email", jsonValidator(authEmailSignInBodySchema), (c) => {
		const body = c.req.valid("json");
		return callAuthApi(c, (api) =>
			api.signInEmail({
				body,
				headers: c.req.raw.headers,
				asResponse: true,
			}),
		);
	})
	.post("/sign-up/email", jsonValidator(authEmailSignUpBodySchema), (c) => {
		const body = c.req.valid("json");
		return callAuthApi(c, (api) =>
			api.signUpEmail({
				body,
				headers: c.req.raw.headers,
				asResponse: true,
			}),
		);
	})
	.post("/sign-in/social", jsonValidator(authSocialSignInBodySchema), (c) => {
		const body = c.req.valid("json");
		return callAuthApi(c, (api) =>
			api.signInSocial({
				body,
				headers: c.req.raw.headers,
				asResponse: true,
			}),
		);
	})
	.post("/link-social", jsonValidator(authLinkSocialBodySchema), (c) => {
		const body = c.req.valid("json");
		return callAuthApi(c, (api) =>
			api.linkSocialAccount({
				body,
				headers: c.req.raw.headers,
				asResponse: true,
			}),
		);
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
		const { oAuthProxy } = c.var.auth.api;
		if (typeof oAuthProxy !== "function") {
			return c.notFound();
		}
		const url = new URL(c.req.url);
		const callbackURL = url.searchParams.get("callbackURL");
		if (!callbackURL) {
			return c.text("Missing callbackURL", 400);
		}
		const profile = url.searchParams.get("profile") ?? undefined;
		return callAuthApi(c, () =>
			oAuthProxy({
				query: { callbackURL, profile },
				headers: c.req.raw.headers,
				request: c.req.raw,
				asResponse: true,
			}),
		);
	});

export type BetterAuthApp = typeof betterAuth;
