/**
 * Patches Better Auth `oAuthProxy` for PR preview → staging passthrough:
 * - `/link-social` uses staging redirect URIs (stock plugin only hooks sign-in)
 * - Account linking completes on the preview D1 via encrypted proxy payload
 */
import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import {
	type AuthMiddlewareCtx,
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

export type PassthroughOAuthProxyOptions = {
	/** Staging auth public URL registered in GitHub/Google consoles. */
	productionURL: string;
	/** Preview (or other non-production) browser origin — `AUTH_BASE_URL`. */
	browserBaseUrl: string;
	/** Match Better Auth `oAuthProxy` default. */
	maxAge?: number;
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

type OAuthProxyEndpoint = {
	handler?: (ctx: AuthMiddlewareCtx) => Promise<unknown>;
};

type OAuthLinkCompletionProvider = Parameters<typeof completeOAuthAccountLink>[1]["provider"];

/**
 * PR previews (and any deploy where `productionURL` ≠ `AUTH_BASE_URL`): proxy social sign-in
 * and `/link-social` through staging callbacks; finish linking on the preview worker DB.
 */
export function configurePassthroughOAuthProxy(
	plugin: BetterAuthPlugin,
	options: PassthroughOAuthProxyOptions,
): void {
	const hooks = plugin.hooks;
	if (!hooks?.before) {
		return;
	}

	const { productionURL, browserBaseUrl } = options;
	const maxAge = options.maxAge ?? 60;
	const productionOrigin = new URL(productionURL).origin;
	const isClientPassthrough =
		stripTrailingSlash(productionURL) !== stripTrailingSlash(browserBaseUrl);

	if (isClientPassthrough) {
		if (hooks.before[0]) {
			hooks.before[0].matcher = isPassthroughOAuthProxyStart;
		}
		if (hooks.after?.[0]) {
			hooks.after[0].matcher = isPassthroughOAuthProxyStart;
		}
	}

	// Staging callback: proxied `/link-social` from previews exchanges here, then redirects to preview.
	hooks.before.splice(1, 0, {
		matcher: (ctx) => productionCallbackMatcher(ctx, productionOrigin),
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
				typeof statePackage["state"] !== "string" ||
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
			const errorRedirectUrl = oauthLinkErrorRedirectUrl(stateData, browserBaseUrl, "/guest/upgrade");
			if (typeof callbackParams["error"] === "string") {
				redirectWithOAuthError(ctx, errorRedirectUrl, callbackParams["error"]);
			}
			const codeRaw = callbackParams["code"];
			if (typeof codeRaw !== "string") {
				redirectWithOAuthError(ctx, errorRedirectUrl, "no_code");
			}
			const providerId = ctx.params?.id as string | undefined;
			const provider = ctx.context.socialProviders.find((p: { id: string }) => p.id === providerId);
			if (!provider) {
				redirectWithOAuthError(ctx, errorRedirectUrl, "oauth_provider_not_found");
			}
			const codeVerifier =
				typeof stateData["codeVerifier"] === "string" ? stateData["codeVerifier"] : "";
			let tokens: Awaited<ReturnType<typeof provider.validateAuthorizationCode>>;
			try {
				tokens = await provider.validateAuthorizationCode({
					code: codeRaw,
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
	});

	if (isClientPassthrough) {
		wrapOAuthProxyCallbackForLink(plugin, { browserBaseUrl, maxAge });
	}
}

function wrapOAuthProxyCallbackForLink(
	plugin: BetterAuthPlugin,
	options: { browserBaseUrl: string; maxAge: number },
): void {
	const endpoint = (plugin.endpoints as { oAuthProxy?: OAuthProxyEndpoint } | undefined)?.oAuthProxy;
	const stockHandler = endpoint?.handler;
	if (!endpoint || typeof stockHandler !== "function") {
		return;
	}

	endpoint.handler = async (ctx: AuthMiddlewareCtx) => {
		const encryptedProfile = (ctx.query as { profile?: string }).profile;
		if (typeof encryptedProfile === "string" && encryptedProfile.length > 0) {
			let decryptedPayload: string;
			try {
				decryptedPayload = await symmetricDecrypt({
					key: ctx.context.secretConfig,
					data: encryptedProfile,
				});
			} catch {
				return stockHandler(ctx);
			}
			const payload = parseJsonRecord(decryptedPayload);
			if (payload && isOAuthLinkState(payload["link"])) {
				await handleProxyLinkCallback(ctx, payload, options);
				return;
			}
		}
		return stockHandler(ctx);
	};
}

async function handleProxyLinkCallback(
	ctx: AuthMiddlewareCtx,
	payload: Record<string, unknown>,
	options: { browserBaseUrl: string; maxAge: number },
): Promise<void> {
	const defaultErrorURL =
		(typeof payload["errorURL"] === "string" && payload["errorURL"]) ||
		`${stripTrailingSlash(options.browserBaseUrl)}/guest/upgrade`;
	const timestamp = payload["timestamp"];
	if (typeof timestamp !== "number") {
		redirectWithOAuthError(ctx, defaultErrorURL, "invalid_payload");
	}
	const age = (Date.now() - timestamp) / 1000;
	if (age > options.maxAge || age < -10) {
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
	const tokens = {
		accessToken: typeof account["accessToken"] === "string" ? account["accessToken"] : undefined,
		refreshToken:
			typeof account["refreshToken"] === "string" ? account["refreshToken"] : undefined,
		idToken: typeof account["idToken"] === "string" ? account["idToken"] : undefined,
		accessTokenExpiresAt:
			typeof account["accessTokenExpiresAtSerialized"] === "string"
				? new Date(account["accessTokenExpiresAtSerialized"])
				: undefined,
		refreshTokenExpiresAt:
			typeof account["refreshTokenExpiresAtSerialized"] === "string"
				? new Date(account["refreshTokenExpiresAtSerialized"])
				: undefined,
		scopes:
			typeof account["scope"] === "string" && account["scope"].length > 0
				? account["scope"].split(",")
				: undefined,
	};
	const errorRedirectUrl =
		(typeof payload["errorURL"] === "string" && payload["errorURL"]) || defaultErrorURL;
	await completeOAuthAccountLink(ctx, {
		link,
		provider: provider as OAuthLinkCompletionProvider,
		tokens,
		userInfo,
		errorRedirectUrl,
	});
	const returnUrl =
		(typeof payload["callbackURL"] === "string" && payload["callbackURL"]) ||
		resolveOAuthReturnUrl({}, options.browserBaseUrl, "/guest/upgrade");
	throw ctx.redirect(returnUrl);
}
