import { isLoopbackOAuthProxyProductionUrl } from "alchemy-utils/auth-oauth-proxy-url";

type AuthProviderEnv = {
	readonly AUTH_BASE_URL?: string;
	readonly AUTH_OAUTH_PROXY_PRODUCTION_URL?: string;
	readonly GOOGLE_CLIENT_ID?: string;
	readonly GOOGLE_CLIENT_SECRET?: string;
	readonly GH_CLIENT_ID?: string;
	readonly GH_CLIENT_SECRET?: string;
};

function stripTrailingSlash(url: string): string {
	return url.replace(/\/+$/, "");
}

export function authProviderFlags(env: AuthProviderEnv) {
	const oauthProxyProductionUrl = env.AUTH_OAUTH_PROXY_PRODUCTION_URL?.trim() ?? "";
	const oauthProxy = oauthProxyProductionUrl.length > 0;
	const googleLoopbackOAuthProxy =
		oauthProxy && isLoopbackOAuthProxyProductionUrl(oauthProxyProductionUrl);
	const authBaseUrl = env.AUTH_BASE_URL?.trim() ?? "";
	const oauthProxyPassthrough =
		oauthProxy &&
		authBaseUrl.length > 0 &&
		stripTrailingSlash(oauthProxyProductionUrl) !== stripTrailingSlash(authBaseUrl);

	return {
		google: Boolean(env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim()),
		github: Boolean(env.GH_CLIENT_ID?.trim() && env.GH_CLIENT_SECRET?.trim()),
		email: true as const,
		oauthProxy,
		oauthProxyPassthrough,
		googleLoopbackOAuthProxy,
	};
}
