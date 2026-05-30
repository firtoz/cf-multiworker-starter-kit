/**
 * Better Auth `oAuthProxy` extension for local Portless + Google:
 * - Google-only loopback redirect (GitHub keeps `https://*.localhost/...`)
 * - `/link-social` + loopback link completion (upstream #9390)
 * - OAuth errors use the same `?error=` redirect as stock Better Auth (`errorCallbackURL`)
 */

import { AUTH_OAUTH_EMAIL_ALREADY_IN_USE_CODE } from "@internal/auth-db/constants";
import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { symmetricDecrypt } from "better-auth/crypto";
import { setTokenUtil } from "better-auth/oauth2";
import { oAuthProxy } from "better-auth/plugins";
import {
	mergeOAuthProxyPlugin,
	type OAuthProxyPluginHooks,
	withMatcher,
} from "./oauth-proxy-plugin-merge";

type OAuthLinkState = { userId: string; email: string };

type AuthMiddlewareCtx =
	Parameters<Parameters<typeof createAuthMiddleware>[0]> extends [infer C] ? C : never;

export type OAuthLinkCompleted = {
	userId: string;
	providerId: string;
	email: string;
	emailVerified: boolean;
};

export type LocalGoogleOAuthProxyOptions = {
	/** Loopback origin registered in Google Cloud, e.g. `http://127.0.0.1:5173`. */
	productionURL: string;
	/** Portless browser origin (`AUTH_BASE_URL`), e.g. `https://starter-web.localhost`. */
	browserBaseUrl: string;
	afterOAuthLink?: (input: OAuthLinkCompleted) => Promise<void>;
	isEmailOwnedByOtherAccount?: (userId: string, email: string) => Promise<boolean>;
};

/** Stock `oAuthProxy` plus Portless Google link-social and loopback callback handling. */
export function createLocalGoogleOAuthProxyPlugin(
	options: LocalGoogleOAuthProxyOptions,
): BetterAuthPlugin {
	const base = oAuthProxy({
		productionURL: options.productionURL,
		currentURL: options.browserBaseUrl,
	});
	return mergeOAuthProxyPlugin(base, buildLocalGoogleOAuthProxyHooks(base, options));
}

function isOAuthProxySocialStartPath(path: string | undefined): boolean {
	return !!(
		path?.startsWith("/sign-in/social") ||
		path?.startsWith("/sign-in/oauth2") ||
		path === "/link-social"
	);
}

/** Loopback `oAuthProxy` is for Google only — GitHub accepts Portless `*.localhost` callbacks. */
function isGoogleOAuthProxyStart(ctx: { path?: string; body?: unknown }): boolean {
	if (!isOAuthProxySocialStartPath(ctx.path)) {
		return false;
	}
	const provider = (ctx.body as { provider?: string } | undefined)?.provider;
	return provider === "google";
}

function googleCallbackMatcher(ctx: { path?: string; params?: { id?: string } }): boolean {
	return ctx.path === "/callback/:id" && ctx.params?.id === "google";
}

function stripTrailingSlash(url: string): string {
	return url.replace(/\/+$/, "");
}

function resolveAccountReturnUrl(
	stateData: Record<string, unknown>,
	browserBaseUrl: string,
): string {
	const fallback = `${stripTrailingSlash(browserBaseUrl)}/account`;
	const callbackURL = stateData["callbackURL"];
	if (typeof callbackURL !== "string") {
		return fallback;
	}
	if (callbackURL.includes("oauth-proxy-callback")) {
		try {
			const inner = new URL(callbackURL).searchParams.get("callbackURL");
			if (inner) {
				return inner;
			}
		} catch {
			return fallback;
		}
	}
	return callbackURL;
}

/** Prefer `errorCallbackURL` from link-social state; else the success return URL. */
function oauthLinkErrorRedirectUrl(
	stateData: Record<string, unknown>,
	browserBaseUrl: string,
): string {
	const errorURL = stateData["errorURL"];
	if (typeof errorURL === "string" && errorURL.length > 0) {
		return errorURL;
	}
	return resolveAccountReturnUrl(stateData, browserBaseUrl);
}

/** Same shape as Better Auth `redirectOnError` (oauth-proxy/utils.mjs). */
function redirectWithOAuthError(ctx: AuthMiddlewareCtx, errorURL: string, error: string): never {
	const sep = errorURL.includes("?") ? "&" : "?";
	throw ctx.redirect(`${errorURL}${sep}error=${error}`);
}

function parseJsonRecord(value: string): Record<string, unknown> | null {
	try {
		const parsed: unknown = JSON.parse(value);
		return parsed !== null && typeof parsed === "object"
			? (parsed as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

function isOAuthLinkState(value: unknown): value is OAuthLinkState {
	if (value === null || typeof value !== "object") {
		return false;
	}
	const o = value as Record<string, unknown>;
	return typeof o["userId"] === "string" && typeof o["email"] === "string";
}

function buildLocalGoogleOAuthProxyHooks(
	base: BetterAuthPlugin,
	options: LocalGoogleOAuthProxyOptions,
): OAuthProxyPluginHooks {
	const { productionURL, browserBaseUrl } = options;
	const productionOrigin = new URL(productionURL).origin;
	const loopbackHost = new URL(productionURL).host;
	const browser = new URL(browserBaseUrl);

	const stockBefore = base.hooks?.before ?? [];
	const stockAfter = base.hooks?.after ?? [];

	const updatedStockBefore = stockBefore.map((hook, index) => {
		if (index === 0) {
			return withMatcher(hook, isGoogleOAuthProxyStart);
		}
		if (index === stockBefore.length - 1) {
			return withMatcher(hook, googleCallbackMatcher);
		}
		return hook;
	});

	const loopbackBaseUrlHook = {
		matcher: googleCallbackMatcher,
		handler: createAuthMiddleware(async (ctx) => {
			const requestUrl = ctx.request?.url;
			if (!requestUrl || new URL(requestUrl).origin !== productionOrigin) {
				return;
			}
			const basePath = ctx.context.options.basePath || "/api/auth";
			ctx.context.baseURL = `${stripTrailingSlash(productionURL)}${basePath}`;
		}),
	};

	const linkSocialCompletionHook = {
		matcher: googleCallbackMatcher,
		handler: createAuthMiddleware(async (ctx: AuthMiddlewareCtx) => {
			const requestUrl = ctx.request?.url as string | undefined;
			if (!requestUrl || new URL(requestUrl).origin !== productionOrigin) {
				return;
			}
			const callbackParams = {
				...(ctx.query as Record<string, unknown>),
				...(ctx.body as Record<string, unknown> | undefined),
			};
			const state = callbackParams["state"];
			if (typeof state !== "string") {
				return;
			}
			let statePackage: Record<string, unknown> | null;
			try {
				statePackage = parseJsonRecord(
					await symmetricDecrypt({
						key: ctx.context.secretConfig,
						data: state,
					}),
				);
			} catch {
				return;
			}
			if (
				!statePackage ||
				statePackage["isOAuthProxy"] !== true ||
				typeof statePackage["state"] !== "string" ||
				typeof statePackage["stateCookie"] !== "string"
			) {
				return;
			}
			let stateData: Record<string, unknown> | null;
			try {
				stateData = parseJsonRecord(
					await symmetricDecrypt({
						key: ctx.context.secretConfig,
						data: statePackage["stateCookie"] as string,
					}),
				);
			} catch {
				return;
			}
			if (!stateData || !isOAuthLinkState(stateData["link"])) {
				return;
			}
			const link = stateData["link"];
			const returnUrl = resolveAccountReturnUrl(stateData, browserBaseUrl);
			const errorRedirectUrl = oauthLinkErrorRedirectUrl(stateData, browserBaseUrl);
			if (typeof callbackParams["error"] === "string") {
				redirectWithOAuthError(ctx, errorRedirectUrl, callbackParams["error"]);
			}
			const codeRaw = callbackParams["code"];
			if (typeof codeRaw !== "string") {
				redirectWithOAuthError(ctx, errorRedirectUrl, "no_code");
			}
			const code = codeRaw;
			const providerId = ctx.params?.["id"] as string | undefined;
			const provider = ctx.context.socialProviders.find((p: { id: string }) => p.id === providerId);
			if (!provider) {
				redirectWithOAuthError(ctx, errorRedirectUrl, "oauth_provider_not_found");
			}
			const codeVerifier =
				typeof stateData["codeVerifier"] === "string" ? stateData["codeVerifier"] : "";
			let tokens: Awaited<ReturnType<typeof provider.validateAuthorizationCode>>;
			try {
				tokens = await provider.validateAuthorizationCode({
					code,
					codeVerifier,
					redirectURI: `${ctx.context.baseURL}/callback/${provider.id}`,
				});
			} catch {
				redirectWithOAuthError(ctx, errorRedirectUrl, "invalid_code");
			}
			if (!tokens) {
				redirectWithOAuthError(ctx, errorRedirectUrl, "invalid_code");
			}
			const userInfo = (await provider.getUserInfo(tokens))?.user;
			if (!userInfo?.email) {
				redirectWithOAuthError(ctx, errorRedirectUrl, "email_not_found");
			}
			const providerAccountId = String(userInfo.id);
			if (
				(!ctx.context.trustedProviders.includes(provider.id) && !userInfo.emailVerified) ||
				ctx.context.options.account?.accountLinking?.enabled === false
			) {
				redirectWithOAuthError(ctx, errorRedirectUrl, "unable_to_link_account");
			}
			if (
				userInfo.email.toLowerCase() !== link.email.toLowerCase() &&
				ctx.context.options.account?.accountLinking?.allowDifferentEmails !== true
			) {
				redirectWithOAuthError(ctx, errorRedirectUrl, "email_doesn't_match");
			}
			const existingAccount = await ctx.context.internalAdapter.findAccountByProviderId(
				providerAccountId,
				provider.id,
			);
			if (existingAccount) {
				if (existingAccount.userId.toString() !== link.userId.toString()) {
					redirectWithOAuthError(ctx, errorRedirectUrl, "account_already_linked_to_different_user");
				}
				const updateData = Object.fromEntries(
					Object.entries({
						accessToken: await setTokenUtil(tokens.accessToken, ctx.context),
						refreshToken: await setTokenUtil(tokens.refreshToken, ctx.context),
						idToken: tokens.idToken,
						accessTokenExpiresAt: tokens.accessTokenExpiresAt,
						refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
						scope: tokens.scopes?.join(","),
					}).filter((entry) => entry[1] !== undefined),
				);
				await ctx.context.internalAdapter.updateAccount(existingAccount.id, updateData);
			} else {
				if (
					options.isEmailOwnedByOtherAccount &&
					(await options.isEmailOwnedByOtherAccount(link.userId, userInfo.email.toLowerCase()))
				) {
					redirectWithOAuthError(ctx, errorRedirectUrl, AUTH_OAUTH_EMAIL_ALREADY_IN_USE_CODE);
				}
				const created = await ctx.context.internalAdapter.createAccount({
					userId: link.userId,
					providerId: provider.id,
					accountId: providerAccountId,
					accessToken: await setTokenUtil(tokens.accessToken, ctx.context),
					refreshToken: await setTokenUtil(tokens.refreshToken, ctx.context),
					idToken: tokens.idToken,
					accessTokenExpiresAt: tokens.accessTokenExpiresAt,
					refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
					scope: tokens.scopes?.join(","),
				});
				if (!created) {
					redirectWithOAuthError(ctx, errorRedirectUrl, "unable_to_link_account");
				}
			}
			if (options.afterOAuthLink && typeof userInfo.email === "string") {
				await options.afterOAuthLink({
					userId: link.userId,
					providerId: provider.id,
					email: userInfo.email,
					emailVerified: userInfo.emailVerified === true,
				});
			}
			throw ctx.redirect(returnUrl);
		}),
	};

	const locationRewriteHook = {
		matcher: googleCallbackMatcher,
		handler: createAuthMiddleware(async (ctx) => {
			const location = ctx.context.responseHeaders?.get("location");
			if (!location?.includes("/oauth-proxy-callback")) {
				return;
			}
			let url: URL;
			try {
				url = new URL(location);
			} catch {
				return;
			}
			if (url.host !== loopbackHost) {
				return;
			}
			url.protocol = browser.protocol;
			url.host = browser.host;
			ctx.setHeader("location", url.toString());
		}),
	};

	const updatedStockAfter = stockAfter.map((hook, index) =>
		index === 0 ? withMatcher(hook, isGoogleOAuthProxyStart) : hook,
	);

	return {
		before: [loopbackBaseUrlHook, linkSocialCompletionHook, ...updatedStockBefore],
		after: [...updatedStockAfter, locationRewriteHook],
	};
}
