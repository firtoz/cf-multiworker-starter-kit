import { resolveAuthBaseUrl } from "./auth-deploy-hostnames";
import { isPrStage } from "./deployment-stage";
import {
	localGoogleOAuthLoopbackOrigin,
	shouldEnableLocalGoogleOAuthProxy,
} from "./local-google-oauth-dev";

/** True when OAuth proxy target is local loopback (Portless + Google dev trick). */
export function isLoopbackOAuthProxyProductionUrl(productionUrl: string): boolean {
	try {
		const host = new URL(productionUrl).hostname;
		return host === "127.0.0.1" || host === "localhost" || host === "[::1]";
	} catch {
		return false;
	}
}

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
