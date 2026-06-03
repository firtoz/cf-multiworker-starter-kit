import { DEFAULT_REACT_ROUTER_WEB_RESOURCE_ID, PRODUCT_PREFIX } from "./worker-peer-scripts";

export const LOCAL_PORTLESS_ENV_KEY = "LOCAL_PORTLESS" as const;

/**
 * Portless TLD suffix (default `localhost`). Set in `.env.local` or passed to `portless run` via
 * `PORTLESS_TLD` env (current Portless CLI does not accept `--tld` on `run`). Does not fix Google OAuth.
 */
export const PORTLESS_TLD_ENV_KEY = "PORTLESS_TLD" as const;

/** Auth worker `dev.port` in `workers/auth-worker/alchemy.run.ts`. */
export const LOCAL_AUTH_DEV_PORT = 8784;

/** PostHog proxy worker `dev.port` in `workers/posthog-proxy/alchemy.run.ts`. */
export const LOCAL_POSTHOG_PROXY_DEV_PORT = 8785;

export function isLocalPortlessExplicitlyDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
	return env[LOCAL_PORTLESS_ENV_KEY]?.trim().toLowerCase() === "off";
}

export function isPortlessLocalDevEnabled(
	stage: string,
	env: NodeJS.ProcessEnv = process.env,
): boolean {
	return stage === "local" && !isLocalPortlessExplicitlyDisabled(env);
}

export function localWebPortlessRouteName(): string {
	return `${PRODUCT_PREFIX}-${DEFAULT_REACT_ROUTER_WEB_RESOURCE_ID}`;
}

/** Portless hostname TLD without leading dot (e.g. `localhost`, `test`). */
export function localPortlessTld(env: NodeJS.ProcessEnv = process.env): string {
	const raw = env[PORTLESS_TLD_ENV_KEY]?.trim().toLowerCase();
	if (!raw) {
		return "localhost";
	}
	return raw.replace(/^\./, "");
}

/** Public Portless web hostname, e.g. `starter-web.localhost` or `starter-web.test`. */
export function localWebPortlessHostname(env: NodeJS.ProcessEnv = process.env): string {
	return `${localWebPortlessRouteName()}.${localPortlessTld(env)}`;
}

/** Prefix for `portless run` when `PORTLESS_TLD` in `.env.local` should override `.localhost`. */
export function portlessRunShellEnvPrefix(env: NodeJS.ProcessEnv = process.env): string {
	const tld = localPortlessTld(env);
	return tld === "localhost" ? "" : `${PORTLESS_TLD_ENV_KEY}=${tld} `;
}

/** Portless `--name` for the auth worker (e.g. `starter-auth`). */
export function localAuthPortlessRouteName(): string {
	return `${PRODUCT_PREFIX}-auth`;
}

/** Plain `http://localhost` web dev when Portless is off (Vite default; override with `PORT`). */
export const LOCAL_WEB_DEV_PORT = 5173;

/**
 * Default Better Auth **browser** base URL when **`AUTH_DOMAINS`** / **`WEB_DOMAINS`** are unset in **local**.
 * Local dev forwards `/api/auth/*` on the web worker to the auth service binding, so the public URL is the
 * web origin (Portless `https://<prefix>-web.<tld>` by default), not `127.0.0.1:8784`.
 */
export function defaultLocalAuthBaseUrl(
	env: NodeJS.ProcessEnv = process.env,
	stage = env["STAGE"]?.trim(),
): string | undefined {
	if (stage !== "local") {
		return undefined;
	}
	if (isPortlessLocalDevEnabled(stage, env)) {
		return `https://${localWebPortlessHostname(env)}`;
	}
	const portRaw = Number(env["PORT"]?.trim());
	const port = Number.isFinite(portRaw) && portRaw > 0 ? Math.floor(portRaw) : LOCAL_WEB_DEV_PORT;
	return `http://127.0.0.1:${port}`;
}
