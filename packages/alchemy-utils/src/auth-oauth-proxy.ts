import { resolveAuthBaseUrl } from "./auth-deploy-hostnames";
import { isPrStage } from "./deployment-stage";
import {
	localGoogleOAuthLoopbackOrigin,
	shouldEnableLocalGoogleOAuthProxy,
} from "./local-google-oauth-dev";

export { isLoopbackOAuthProxyProductionUrl } from "./auth-oauth-proxy-url";

export type ResolveAuthOAuthProxyProductionUrlOptions = {
	readonly stage: string;
	readonly env?: NodeJS.ProcessEnv;
};

/**
 * Better Auth `oAuthProxy` production URL for this deploy stage.
 *
 * - **local + Portless + Google** → loopback (`http://127.0.0.1:<port>`)
 * - **pr-*** → staging auth public URL (GitHub/Google callback registered there)
 * - **staging** → staging auth public URL (handles passthrough callbacks from PR previews)
 * - otherwise → empty (no proxy plugin)
 */
export async function resolveAuthOAuthProxyProductionUrl(
	options: ResolveAuthOAuthProxyProductionUrlOptions,
): Promise<string> {
	const env = options.env ?? process.env;
	const stage = options.stage;

	if (shouldEnableLocalGoogleOAuthProxy(env, stage)) {
		return localGoogleOAuthLoopbackOrigin(env);
	}

	if (isPrStage(stage) || stage === "staging") {
		return resolveAuthBaseUrl({ stage: "staging", env });
	}

	return "";
}
