import { DEFAULT_REACT_ROUTER_WEB_RESOURCE_ID, PRODUCT_PREFIX } from "./worker-peer-scripts";

export const LOCAL_PORTLESS_ENV_KEY = "LOCAL_PORTLESS" as const;

/** Auth worker `dev.port` in `workers/auth-worker/alchemy.run.ts`. */
export const LOCAL_AUTH_DEV_PORT = 8784;

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

/** Portless `--name` for the auth worker (e.g. `starter-auth`). */
export function localAuthPortlessRouteName(): string {
	return `${PRODUCT_PREFIX}-auth`;
}

/** Plain `http://localhost` web dev when Portless is off (Vite default; override with `PORT`). */
export const LOCAL_WEB_DEV_PORT = 5173;

/**
 * Default Better Auth **browser** base URL when **`AUTH_DOMAINS`** / **`WEB_DOMAINS`** are unset in **local**.
 * Local dev forwards `/api/auth/*` on the web worker to the auth service binding, so the public URL is the
 * web origin (Portless `https://<prefix>-web.localhost` by default), not `127.0.0.1:8784`.
 */
export function defaultLocalAuthBaseUrl(
	env: NodeJS.ProcessEnv = process.env,
	stage = env["STAGE"]?.trim(),
): string | undefined {
	if (stage !== "local") {
		return undefined;
	}
	if (isPortlessLocalDevEnabled(stage, env)) {
		return `https://${localWebPortlessRouteName()}.localhost`;
	}
	const portRaw = Number(env["PORT"]?.trim());
	const port = Number.isFinite(portRaw) && portRaw > 0 ? Math.floor(portRaw) : LOCAL_WEB_DEV_PORT;
	return `http://127.0.0.1:${port}`;
}
