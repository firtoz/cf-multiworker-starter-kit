import { authDb } from "@internal/auth-db/alchemy";
import alchemy from "alchemy";
import { KVNamespace, Worker } from "alchemy/cloudflare";
import { requireAlchemyPassword, requireEnv } from "alchemy-utils";
import { alchemyCiCloudStateStoreOptions } from "alchemy-utils/alchemy-cloud-state-store";
import { AUTH_DOMAINS_ENV_KEY, resolveAuthBaseUrl } from "alchemy-utils/auth-deploy-hostnames";
import { resolveAuthOAuthProxyProductionUrl } from "alchemy-utils/auth-oauth-proxy";
import { isLoopbackOAuthProxyProductionUrl } from "alchemy-utils/auth-oauth-proxy-url";
import { isPrStage, resolveStageFromEnv } from "alchemy-utils/deployment-stage";
import { readProcessEnvTrimmed } from "alchemy-utils/env-requirements";
import {
	defaultLocalAuthBaseUrl,
	isPortlessLocalDevEnabled,
	LOCAL_AUTH_DEV_PORT,
	LOCAL_WEB_DEV_PORT,
} from "alchemy-utils/local-portless-dev";
import { commaSeparatedEnvSegments, WEB_DOMAINS_ENV_KEY } from "alchemy-utils/web-deploy-hostnames";
import { ALCHEMY_APP_IDS, DEFAULT_WORKER_RESOURCE_ID } from "alchemy-utils/worker-peer-scripts";

const stage = resolveStageFromEnv();
const app = await alchemy(ALCHEMY_APP_IDS.auth, {
	stage,
	...alchemyCiCloudStateStoreOptions(stage),
});
requireAlchemyPassword(app);

const betterAuthSecretRaw = requireEnv("BETTER_AUTH_SECRET", "Better Auth signing secret", app);
const authAdminSecretRaw = requireEnv(
	"AUTH_ADMIN_SECRET",
	"Machine admin API secret for trusted origins automation",
	app,
);
const bootstrapAdmins = readProcessEnvTrimmed("AUTH_BOOTSTRAP_ADMIN_EMAILS");

const authBaseUrl = await resolveAuthBaseUrl({ stage });

if (commaSeparatedEnvSegments(process.env[AUTH_DOMAINS_ENV_KEY]).length > 0) {
	console.warn({
		worker: "auth-worker",
		warning:
			"AUTH_DOMAINS is ignored — auth worker is service-binding only. Use WEB_DOMAINS on the web worker.",
	});
}

const webOriginsForCors = commaSeparatedEnvSegments(process.env[WEB_DOMAINS_ENV_KEY]).map(
	(d) => `https://${d}`,
);
const localViteOrigin =
	stage === "local"
		? (() => {
				const portRaw = Number(process.env["PORT"]?.trim());
				const port =
					Number.isFinite(portRaw) && portRaw > 0 ? Math.floor(portRaw) : LOCAL_WEB_DEV_PORT;
				return `http://127.0.0.1:${port}`;
			})()
		: undefined;

const authOAuthProxyProductionUrl = await resolveAuthOAuthProxyProductionUrl({ stage });

const authSeedOrigins = [
	...commaSeparatedEnvSegments(process.env["AUTH_SEED_ORIGINS"]),
	authBaseUrl,
	defaultLocalAuthBaseUrl(process.env, stage),
	localViteOrigin,
	...webOriginsForCors,
]
	.filter((v): v is string => typeof v === "string" && v.length > 0)
	.filter((v, i, a) => a.indexOf(v) === i)
	.join(",");

export const authKv = await KVNamespace("auth-kv", { adopt: true });

export const authWorker = await Worker(DEFAULT_WORKER_RESOURCE_ID, {
	entrypoint: new URL("./workers/app.ts", import.meta.url).pathname,
	compatibility: "node",
	placement: { mode: "smart" },
	dev: { port: LOCAL_AUTH_DEV_PORT },
	adopt: true,
	url: false,
	previewSubdomains: false,
	domains: [],
	bindings: {
		DB: authDb,
		AUTH_KV: authKv,
		BETTER_AUTH_SECRET: alchemy.secret(betterAuthSecretRaw),
		AUTH_ADMIN_SECRET: alchemy.secret(authAdminSecretRaw),
		AUTH_BASE_URL: authBaseUrl,
		AUTH_BOOTSTRAP_ADMIN_EMAILS: bootstrapAdmins,
		AUTH_SEED_ORIGINS: authSeedOrigins,
		GOOGLE_CLIENT_ID: readProcessEnvTrimmed("GOOGLE_CLIENT_ID"),
		GOOGLE_CLIENT_SECRET: readProcessEnvTrimmed("GOOGLE_CLIENT_SECRET"),
		GH_CLIENT_ID: readProcessEnvTrimmed("GH_CLIENT_ID"),
		GH_CLIENT_SECRET: readProcessEnvTrimmed("GH_CLIENT_SECRET"),
		AUTH_OAUTH_PROXY_PRODUCTION_URL: authOAuthProxyProductionUrl,
	},
});

if (stage === "local" && isPortlessLocalDevEnabled(stage) && authOAuthProxyProductionUrl) {
	console.log({
		worker: "auth-worker",
		oauthProxy: "Google OAuth uses loopback redirect URI (GitHub keeps Portless callback)",
		oauthProxyProductionURL: authOAuthProxyProductionUrl,
		registerInGoogleConsole: `${authOAuthProxyProductionUrl}/api/auth/callback/google`,
	});
}

if (
	isPrStage(stage) &&
	authOAuthProxyProductionUrl &&
	!isLoopbackOAuthProxyProductionUrl(authOAuthProxyProductionUrl)
) {
	console.log({
		worker: "auth-worker",
		oauthProxy: "PR preview OAuth routes through staging callback URL",
		oauthProxyProductionURL: authOAuthProxyProductionUrl,
		registerGitHubCallback: `${authOAuthProxyProductionUrl}/api/auth/callback/github`,
		registerGoogleCallback: `${authOAuthProxyProductionUrl}/api/auth/callback/google`,
	});
}

console.log({
	worker: "auth-worker",
	scriptName: authWorker.name,
	authBaseUrl,
	note: "Service-binding only (url: false) — no workers.dev; browsers use web /api/auth/*.",
});

await app.finalize();
