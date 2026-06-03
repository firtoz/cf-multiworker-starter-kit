import {
	isPortlessLocalDevEnabled,
	LOCAL_PORTLESS_ENV_KEY,
	LOCAL_WEB_DEV_PORT,
} from "./local-portless-dev";

/** Loopback origin for Google OAuth when Portless is on (register this in Google Cloud). */
export function localGoogleOAuthLoopbackOrigin(env: NodeJS.ProcessEnv = process.env): string {
	return `http://127.0.0.1:${localGoogleOAuthLoopbackPort(env)}`;
}

/**
 * Use Better Auth `oAuthProxy` so social OAuth redirect URIs use loopback while the app stays on Portless.
 * Requires `http://127.0.0.1:<port>/api/auth/callback/google` in Google Cloud (not `*.localhost`).
 */
export function shouldEnableLocalGoogleOAuthProxy(
	env: NodeJS.ProcessEnv = process.env,
	stage = env["STAGE"]?.trim() ?? "local",
): boolean {
	return (
		stage === "local" && isPortlessLocalDevEnabled(stage, env) && hasGoogleOAuthCredentials(env)
	);
}

export const GOOGLE_CLIENT_ID_ENV_KEY = "GOOGLE_CLIENT_ID" as const;
export const GOOGLE_CLIENT_SECRET_ENV_KEY = "GOOGLE_CLIENT_SECRET" as const;

/** `bun run setup:local` note when Google + Portless without auto proxy (should be rare). */
export const GOOGLE_PORTLESS_CONFLICT_SETUP_NOTE = [
	"Google OAuth and Portless are both set, but loopback OAuth proxy is not active.",
	"",
	"Normally dev enables Better Auth oAuthProxy automatically (Google redirect via 127.0.0.1).",
	"If you see this anyway: set LOCAL_PORTLESS=off, or test Google on staging. See docs/oauth-setup.md.",
].join("\n");

function envAssignmentValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
	const v = env[key]?.trim();
	return v || undefined;
}

function envAssignmentValueFromText(raw: string, key: string): string | undefined {
	const re = new RegExp(`^\\s*${key}\\s*=\\s*([^\\n]*)`, "m");
	const m = re.exec(raw);
	const v = m?.[1]?.trim();
	return v || undefined;
}

export function hasGoogleOAuthCredentials(env: NodeJS.ProcessEnv = process.env): boolean {
	return Boolean(
		envAssignmentValue(env, GOOGLE_CLIENT_ID_ENV_KEY) &&
			envAssignmentValue(env, GOOGLE_CLIENT_SECRET_ENV_KEY),
	);
}

export function hasGoogleOAuthCredentialsInEnvText(raw: string): boolean {
	return Boolean(
		envAssignmentValueFromText(raw, GOOGLE_CLIENT_ID_ENV_KEY) &&
			envAssignmentValueFromText(raw, GOOGLE_CLIENT_SECRET_ENV_KEY),
	);
}

function localPortlessEnvFromText(raw: string): NodeJS.ProcessEnv {
	return { [LOCAL_PORTLESS_ENV_KEY]: envAssignmentValueFromText(raw, LOCAL_PORTLESS_ENV_KEY) };
}

/** True when Portless + Google are set but loopback OAuth proxy is not active (misconfiguration). */
export function isLocalGoogleOAuthPortlessConflict(
	env: NodeJS.ProcessEnv = process.env,
	stage = env["STAGE"]?.trim() ?? "local",
): boolean {
	return (
		stage === "local" &&
		hasGoogleOAuthCredentials(env) &&
		isPortlessLocalDevEnabled(stage, env) &&
		!shouldEnableLocalGoogleOAuthProxy(env, stage)
	);
}

function envFromDotfileText(raw: string): NodeJS.ProcessEnv {
	return {
		...localPortlessEnvFromText(raw),
		[GOOGLE_CLIENT_ID_ENV_KEY]: envAssignmentValueFromText(raw, GOOGLE_CLIENT_ID_ENV_KEY),
		[GOOGLE_CLIENT_SECRET_ENV_KEY]: envAssignmentValueFromText(raw, GOOGLE_CLIENT_SECRET_ENV_KEY),
	};
}

export function isLocalGoogleOAuthPortlessConflictInEnvText(
	raw: string,
	mode: "local" | "staging" | "prod",
): boolean {
	if (mode !== "local") {
		return false;
	}
	return isLocalGoogleOAuthPortlessConflict(envFromDotfileText(raw), "local");
}

/** Loopback port for Google OAuth redirect hints (honors `PORT` when Portless is off). */
export function localGoogleOAuthLoopbackPort(env: NodeJS.ProcessEnv = process.env): number {
	const portRaw = Number(env["PORT"]?.trim());
	return Number.isFinite(portRaw) && portRaw > 0 ? Math.floor(portRaw) : LOCAL_WEB_DEV_PORT;
}

export function googleOAuthLocalDevWarning(
	env: NodeJS.ProcessEnv = process.env,
	stage = env["STAGE"]?.trim() ?? "local",
	googleConfigured = hasGoogleOAuthCredentials(env),
): string | undefined {
	if (
		!googleConfigured ||
		!isPortlessLocalDevEnabled(stage, env) ||
		stage !== "local" ||
		shouldEnableLocalGoogleOAuthProxy(env, stage)
	) {
		return undefined;
	}
	const port = localGoogleOAuthLoopbackPort(env);
	return `Google sign-in does not work with default Portless HTTPS (*.localhost). Set LOCAL_PORTLESS=off in .env.local, restart dev, open http://127.0.0.1:${port}, and register http://127.0.0.1:${port}/api/auth/callback/google in Google Cloud. See docs/oauth-setup.md.`;
}
