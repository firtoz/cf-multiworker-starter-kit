import { googleOAuthLocalDevWarning } from "alchemy-utils/local-google-oauth-dev";

/** Subset of web Worker bindings used for local Google + Portless warnings. */
export type LocalGoogleOAuthEnvSlice = {
	STAGE?: string;
	LOCAL_PORTLESS?: string;
};

export function googleOAuthPortlessWarningForWebEnv(
	env: LocalGoogleOAuthEnvSlice,
	googleConfigured: boolean,
): string | undefined {
	return googleOAuthLocalDevWarning(
		{
			STAGE: env.STAGE,
			LOCAL_PORTLESS: env.LOCAL_PORTLESS,
		},
		env.STAGE,
		googleConfigured,
	);
}
