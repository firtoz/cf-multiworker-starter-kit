/**
 * Better Auth `oAuthProxy` extension for PR preview → staging passthrough:
 * - `/link-social` uses staging redirect URIs (stock plugin only hooks sign-in)
 * - Account linking completes on the preview D1 via encrypted proxy payload
 */
import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { oAuthProxy } from "better-auth/plugins";
import {
	type AuthMiddlewareCtx,
	applyProductionOAuthBaseUrl,
	completeOAuthAccountLink,
	decryptOAuthProxyStateData,
	decryptOAuthProxyStatePackage,
	isOAuthLinkState,
	isOAuthProxySocialStartPath,
	oauthLinkErrorRedirectUrl,
	parseJsonRecord,
	redirectWithOAuthError,
	resolveOAuthReturnUrl,
	stripTrailingSlash,
} from "./oauth-proxy-link-shared";
import {
	mergeOAuthProxyPlugin,
	type OAuthProxyPluginHooks,
	withMatcher,
} from "./oauth-proxy-plugin-merge";

export type PassthroughOAuthProxyOptions = {
	/** Staging auth public URL registered in GitHub/Google consoles. */
	productionURL: string;
	/** Preview (or other non-production) browser origin — `AUTH_BASE_URL`. */
	browserBaseUrl: string;
	/** Match Better Auth `oAuthProxy` default. */
	maxAge?: number;
	afterOAuthLink?: (input: {
		userId: string;
		providerId: string;
		email: string;
		emailVerified: boolean;
	}) => Promise<void>;
	isEmailOwnedByOtherAccount?: (userId: string, email: string) => Promise<boolean>;
};

function isPassthroughOAuthProxyStart(ctx: { path?: string }): boolean {
	return isOAuthProxySocialStartPath(ctx.path);
}

function productionCallbackMatcher(
	ctx: { path?: string; request?: Request },
	productionOrigin: string,
) {
	return (
		ctx.path === "/callback/:id" &&
		typeof ctx.request?.url === "string" &&
		new URL(ctx.request.url).origin === productionOrigin
	);
}

function oauthProxyCallbackMatcher(ctx: { path?: string }): boolean {
	return ctx.path === "/oauth-proxy-callback";
}

type OAuthLinkCompletionProvider = Parameters<typeof completeOAuthAccountLink>[1]["provider"];

/** PR previews: proxy social sign-in and `/link-social` through staging; finish on preview D1. */
export function createPassthroughOAuthProxyPlugin(
	options: PassthroughOAuthProxyOptions,
): BetterAuthPlugin {
	const base = oAuthProxy({
		productionURL: options.productionURL,
		currentURL: options.browserBaseUrl,
	});
	return mergeOAuthProxyPlugin(base, buildPassthroughOAuthProxyHooks(base, options));
}

function buildPassthroughOAuthProxyHooks(
	base: BetterAuthPlugin,
	options: PassthroughOAuthProxyOptions,
): OAuthProxyPluginHooks {
	const { productionURL, browserBaseUrl, afterOAuthLink, isEmailOwnedByOtherAccount } = options;
	const maxAge = options.maxAge ?? 60;
	const productionOrigin = new URL(productionURL).origin;
	const isClientPassthrough =
		stripTrailingSlash(productionURL) !== stripTrailingSlash(browserBaseUrl);

	let before = [...(base.hooks?.before ?? [])];
	const after = [...(base.hooks?.after ?? [])];

	if (isClientPassthrough) {
		before = before.map((hook, index) =>
			index === 0 ? withMatcher(hook, isPassthroughOAuthProxyStart) : hook,
		);
		before = [
			...before,
			{
				matcher: oauthProxyCallbackMatcher,
				handler: createAuthMiddleware(async (ctx: AuthMiddlewareCtx) => {
					const handled = await tryCompleteProxyLinkFromQuery(ctx, {
						browserBaseUrl,
						maxAge,
						afterOAuthLink,
						isEmailOwnedByOtherAccount,
					});
					if (handled) {
						return;
					}
				}),
			},
		];
	}

	const stagingCallbackHook = {
		matcher: (ctx: { path?: string; request?: Request }) =>
			productionCallbackMatcher(ctx, productionOrigin),
		handler: createAuthMiddleware(async (ctx: AuthMiddlewareCtx) => {
			const callbackParams = {
				...(ctx.query as Record<string, unknown>),
				...(ctx.body as Record<string, unknown> | undefined),
			};
			const state = callbackParams["state"];
			if (typeof state !== "string") {
				return;
			}
			const statePackage = await decryptOAuthProxyStatePackage(ctx, state);
			if (
				!statePackage ||
				statePackage["isOAuthProxy"] !== true ||
				typeof statePackage["stateCookie"] !== "string"
			) {
				return;
			}
			const stateData = await decryptOAuthProxyStateData(
				ctx,
				statePackage["stateCookie"] as string,
			);
			if (!stateData || !isOAuthLinkState(stateData["link"])) {
				return;
			}

			const link = stateData["link"];
			const errorRedirectUrl = oauthLinkErrorRedirectUrl(
				stateData,
				browserBaseUrl,
				"/guest/upgrade",
			);
			if (typeof callbackParams["error"] === "string") {
				console.error("oauth-proxy passthrough link: provider error", {
					provider: ctx.params?.["id"],
					error: callbackParams["error"],
				});
				redirectWithOAuthError(ctx, errorRedirectUrl, callbackParams["error"]);
			}
			const codeRaw = callbackParams["code"];
			if (typeof codeRaw !== "string") {
				redirectWithOAuthError(ctx, errorRedirectUrl, "no_code");
			}
			const providerId = ctx.params?.["id"] as string | undefined;
			const provider = ctx.context.socialProviders.find((p: { id: string }) => p.id === providerId);
			if (!provider) {
				redirectWithOAuthError(ctx, errorRedirectUrl, "oauth_provider_not_found");
			}
			applyProductionOAuthBaseUrl(ctx, productionURL);
			const codeVerifier =
				typeof stateData["codeVerifier"] === "string" ? stateData["codeVerifier"] : "";
			let tokens: Awaited<ReturnType<typeof provider.validateAuthorizationCode>>;
			try {
				tokens = await provider.validateAuthorizationCode({
					code: codeRaw,
					codeVerifier,
					redirectURI: `${ctx.context.baseURL}/callback/${provider.id}`,
				});
			} catch (error) {
				console.error("oauth-proxy passthrough link: invalid_code at staging callback", {
					provider: provider.id,
					redirectURI: `${ctx.context.baseURL}/callback/${provider.id}`,
					error,
				});
				redirectWithOAuthError(ctx, errorRedirectUrl, "invalid_code");
			}
			if (!tokens) {
				redirectWithOAuthError(ctx, errorRedirectUrl, "invalid_code");
			}
			const userInfo = (await provider.getUserInfo(tokens))?.user;
			if (!userInfo || typeof userInfo["email"] !== "string") {
				redirectWithOAuthError(ctx, errorRedirectUrl, "email_not_found");
			}

			const proxyCallbackURL = new URL(stateData["callbackURL"] as string);
			const finalCallbackURL =
				proxyCallbackURL.searchParams.get("callbackURL") || (stateData["callbackURL"] as string);
			const payload = {
				link,
				account: {
					providerId: provider.id,
					accountId: String(userInfo["id"]),
					accessToken: tokens.accessToken,
					refreshToken: tokens.refreshToken,
					idToken: tokens.idToken,
					accessTokenExpiresAtSerialized: tokens.accessTokenExpiresAt?.toISOString(),
					refreshTokenExpiresAtSerialized: tokens.refreshTokenExpiresAt?.toISOString(),
					scope: tokens.scopes?.join(","),
				},
				userInfo: {
					id: String(userInfo["id"]),
					email: userInfo["email"],
					emailVerified: userInfo["emailVerified"] === true,
				},
				callbackURL: finalCallbackURL,
				errorURL: errorRedirectUrl,
				timestamp: Date.now(),
			};
			const encryptedPayload = await symmetricEncrypt({
				key: ctx.context.secretConfig,
				data: JSON.stringify(payload),
			});
			proxyCallbackURL.searchParams.set("profile", encryptedPayload);
			throw ctx.redirect(proxyCallbackURL.toString());
		}),
	};

	const beforeWithStaging =
		before.length > 0
			? [before[0]!, stagingCallbackHook, ...before.slice(1)]
			: [stagingCallbackHook];

	const updatedAfter = isClientPassthrough
		? after.map((hook, index) =>
				index === 0 ? withMatcher(hook, isPassthroughOAuthProxyStart) : hook,
			)
		: after;

	return {
		before: beforeWithStaging,
		after: updatedAfter,
	};
}

async function tryCompleteProxyLinkFromQuery(
	ctx: AuthMiddlewareCtx,
	options: {
		browserBaseUrl: string;
		maxAge: number;
		afterOAuthLink?: PassthroughOAuthProxyOptions["afterOAuthLink"];
		isEmailOwnedByOtherAccount?: PassthroughOAuthProxyOptions["isEmailOwnedByOtherAccount"];
	},
): Promise<boolean> {
	const encryptedProfile = (ctx.query as { profile?: string }).profile;
	if (typeof encryptedProfile !== "string" || encryptedProfile.length === 0) {
		return false;
	}
	let decryptedPayload: string;
	try {
		decryptedPayload = await symmetricDecrypt({
			key: ctx.context.secretConfig,
			data: encryptedProfile,
		});
	} catch (error) {
		console.error("oauth-proxy passthrough link: could not decrypt preview profile", { error });
		return false;
	}
	const payload = parseJsonRecord(decryptedPayload);
	if (!payload || !isOAuthLinkState(payload["link"])) {
		return false;
	}
	await handleProxyLinkCallback(ctx, payload, options);
	return true;
}

async function handleProxyLinkCallback(
	ctx: AuthMiddlewareCtx,
	payload: Record<string, unknown>,
	options: {
		browserBaseUrl: string;
		maxAge: number;
		afterOAuthLink?: PassthroughOAuthProxyOptions["afterOAuthLink"];
		isEmailOwnedByOtherAccount?: PassthroughOAuthProxyOptions["isEmailOwnedByOtherAccount"];
	},
): Promise<void> {
	const defaultErrorURL =
		(typeof payload["errorURL"] === "string" && payload["errorURL"]) ||
		`${stripTrailingSlash(options.browserBaseUrl)}/guest/upgrade`;
	const timestamp = payload["timestamp"];
	if (typeof timestamp !== "number") {
		console.error("oauth-proxy passthrough link: invalid_payload (timestamp)");
		redirectWithOAuthError(ctx, defaultErrorURL, "invalid_payload");
	}
	const age = (Date.now() - timestamp) / 1000;
	if (age > options.maxAge || age < -10) {
		console.error("oauth-proxy passthrough link: payload_expired", { age, maxAge: options.maxAge });
		redirectWithOAuthError(ctx, defaultErrorURL, "payload_expired");
	}
	const link = payload["link"];
	if (!isOAuthLinkState(link)) {
		redirectWithOAuthError(ctx, defaultErrorURL, "invalid_payload");
	}
	const accountRaw = payload["account"];
	if (accountRaw === null || typeof accountRaw !== "object") {
		redirectWithOAuthError(ctx, defaultErrorURL, "invalid_payload");
	}
	const account = accountRaw as Record<string, unknown>;
	const providerId = account["providerId"];
	if (typeof providerId !== "string") {
		redirectWithOAuthError(ctx, defaultErrorURL, "invalid_payload");
	}
	const provider = ctx.context.socialProviders.find((p: { id: string }) => p.id === providerId);
	if (!provider) {
		redirectWithOAuthError(ctx, defaultErrorURL, "oauth_provider_not_found");
	}
	const userInfoRaw = payload["userInfo"];
	if (userInfoRaw === null || typeof userInfoRaw !== "object") {
		redirectWithOAuthError(ctx, defaultErrorURL, "invalid_payload");
	}
	const userInfo = userInfoRaw as Record<string, unknown>;
	const tokens: {
		accessToken?: string;
		refreshToken?: string;
		idToken?: string;
		accessTokenExpiresAt?: Date;
		refreshTokenExpiresAt?: Date;
		scopes?: string[];
	} = {};
	if (typeof account["accessToken"] === "string") {
		tokens.accessToken = account["accessToken"];
	}
	if (typeof account["refreshToken"] === "string") {
		tokens.refreshToken = account["refreshToken"];
	}
	if (typeof account["idToken"] === "string") {
		tokens.idToken = account["idToken"];
	}
	if (typeof account["accessTokenExpiresAtSerialized"] === "string") {
		tokens.accessTokenExpiresAt = new Date(account["accessTokenExpiresAtSerialized"]);
	}
	if (typeof account["refreshTokenExpiresAtSerialized"] === "string") {
		tokens.refreshTokenExpiresAt = new Date(account["refreshTokenExpiresAtSerialized"]);
	}
	if (typeof account["scope"] === "string" && account["scope"].length > 0) {
		tokens.scopes = account["scope"].split(",");
	}
	const errorRedirectUrl =
		(typeof payload["errorURL"] === "string" && payload["errorURL"]) || defaultErrorURL;
	try {
		await completeOAuthAccountLink(ctx, {
			link,
			provider: provider as OAuthLinkCompletionProvider,
			tokens,
			userInfo,
			errorRedirectUrl,
			...(options.afterOAuthLink ? { afterOAuthLink: options.afterOAuthLink } : {}),
			...(options.isEmailOwnedByOtherAccount
				? { isEmailOwnedByOtherAccount: options.isEmailOwnedByOtherAccount }
				: {}),
		});
	} catch (error) {
		if (error && typeof error === "object" && "status" in error) {
			throw error;
		}
		console.error("oauth-proxy passthrough link: completeOAuthAccountLink failed", {
			userId: link.userId,
			providerId,
			error,
		});
		redirectWithOAuthError(ctx, errorRedirectUrl, "unable_to_link_account");
	}
	const returnUrl =
		(typeof payload["callbackURL"] === "string" && payload["callbackURL"]) ||
		resolveOAuthReturnUrl({}, options.browserBaseUrl, "/guest/upgrade");
	throw ctx.redirect(returnUrl);
}
