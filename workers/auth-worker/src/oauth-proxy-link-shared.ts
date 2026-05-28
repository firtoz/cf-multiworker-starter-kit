import type { createAuthMiddleware } from "better-auth/api";
import { symmetricDecrypt } from "better-auth/crypto";
import { setTokenUtil } from "better-auth/oauth2";

export type OAuthLinkState = { userId: string; email: string };

export type AuthMiddlewareCtx =
	Parameters<Parameters<typeof createAuthMiddleware>[0]> extends [infer C] ? C : never;

type SocialProvider = {
	id: string;
	validateAuthorizationCode: (input: {
		code: string;
		codeVerifier: string;
		redirectURI: string;
	}) => Promise<{
		accessToken?: string;
		refreshToken?: string;
		idToken?: string;
		accessTokenExpiresAt?: Date;
		refreshTokenExpiresAt?: Date;
		scopes?: string[];
	} | null>;
	getUserInfo: (tokens: unknown) => Promise<{ user?: Record<string, unknown> } | null>;
};

export function isOAuthProxySocialStartPath(path: string | undefined): boolean {
	return !!(
		path?.startsWith("/sign-in/social") ||
		path?.startsWith("/sign-in/oauth2") ||
		path === "/link-social"
	);
}

export function stripTrailingSlash(url: string): string {
	return url.replace(/\/+$/, "");
}

export function resolveOAuthReturnUrl(
	stateData: Record<string, unknown>,
	browserBaseUrl: string,
	fallbackPath = "/account",
): string {
	const fallback = `${stripTrailingSlash(browserBaseUrl)}${fallbackPath}`;
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
export function oauthLinkErrorRedirectUrl(
	stateData: Record<string, unknown>,
	browserBaseUrl: string,
	fallbackPath = "/account",
): string {
	const errorURL = stateData["errorURL"];
	if (typeof errorURL === "string" && errorURL.length > 0) {
		return errorURL;
	}
	return resolveOAuthReturnUrl(stateData, browserBaseUrl, fallbackPath);
}

/** Same shape as Better Auth `redirectOnError` (oauth-proxy/utils.mjs). */
export function redirectWithOAuthError(
	ctx: AuthMiddlewareCtx,
	errorURL: string,
	error: string,
): never {
	const sep = errorURL.includes("?") ? "&" : "?";
	throw ctx.redirect(`${errorURL}${sep}error=${error}`);
}

export function parseJsonRecord(value: string): Record<string, unknown> | null {
	try {
		const parsed: unknown = JSON.parse(value);
		return parsed !== null && typeof parsed === "object"
			? (parsed as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

export function isOAuthLinkState(value: unknown): value is OAuthLinkState {
	if (value === null || typeof value !== "object") {
		return false;
	}
	const o = value as Record<string, unknown>;
	return typeof o["userId"] === "string" && typeof o["email"] === "string";
}

export async function completeOAuthAccountLink(
	ctx: AuthMiddlewareCtx,
	options: {
		link: OAuthLinkState;
		provider: SocialProvider;
		tokens: NonNullable<Awaited<ReturnType<SocialProvider["validateAuthorizationCode"]>>>;
		userInfo: Record<string, unknown>;
		errorRedirectUrl: string;
	},
): Promise<void> {
	const { link, provider, tokens, userInfo, errorRedirectUrl } = options;
	if (typeof userInfo["email"] !== "string") {
		redirectWithOAuthError(ctx, errorRedirectUrl, "email_not_found");
	}
	const providerAccountId = String(userInfo["id"]);
	if (
		(!ctx.context.trustedProviders.includes(provider.id) && userInfo["emailVerified"] !== true) ||
		ctx.context.options.account?.accountLinking?.enabled === false
	) {
		redirectWithOAuthError(ctx, errorRedirectUrl, "unable_to_link_account");
	}
	if (
		(userInfo["email"] as string).toLowerCase() !== link.email.toLowerCase() &&
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
		return;
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

export async function decryptOAuthProxyStatePackage(
	ctx: AuthMiddlewareCtx,
	state: string,
): Promise<Record<string, unknown> | null> {
	try {
		return parseJsonRecord(
			await symmetricDecrypt({
				key: ctx.context.secretConfig,
				data: state,
			}),
		);
	} catch {
		return null;
	}
}

export async function decryptOAuthProxyStateData(
	ctx: AuthMiddlewareCtx,
	stateCookie: string,
): Promise<Record<string, unknown> | null> {
	try {
		return parseJsonRecord(
			await symmetricDecrypt({
				key: ctx.context.secretConfig,
				data: stateCookie,
			}),
		);
	} catch {
		return null;
	}
}
