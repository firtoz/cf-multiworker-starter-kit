import { defaultLocalAuthBaseUrl } from "alchemy-utils/local-portless-dev";

type AuthCanonicalOriginEnv = {
	STAGE?: string;
	LOCAL_PORTLESS?: string;
	PORT?: string;
	PORTLESS_TLD?: string;
};

/** Use the configured local Portless origin instead of echoing accidental loopback URLs. */
export function authCanonicalOrigin(url: URL, env: AuthCanonicalOriginEnv): string {
	return defaultLocalAuthBaseUrl(env, env.STAGE) ?? url.origin;
}
