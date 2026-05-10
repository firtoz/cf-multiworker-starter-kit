import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { mainDb } from "@internal/db/alchemy";
import alchemy from "alchemy";
import { ReactRouter } from "alchemy/cloudflare";
import { requireAlchemyPassword, requireEnv } from "alchemy-utils";
import { alchemyCiCloudStateStoreOptions } from "alchemy-utils/alchemy-cloud-state-store";
import { CI_WEB_DEPLOY_URL_RELPATH } from "alchemy-utils/ci-deploy-web-url";
import { isPrStage, resolveStageFromEnv } from "alchemy-utils/deployment-stage";
import { readProcessEnvTrimmed } from "alchemy-utils/env-requirements";
import { pickListenPort } from "alchemy-utils/pick-listen-port";
import {
	reactRouterDomainsFromProcessEnv,
	reactRouterRoutesFromProcessEnv,
} from "alchemy-utils/web-deploy-hostnames";
import {
	ALCHEMY_APP_IDS,
	DEFAULT_REACT_ROUTER_WEB_RESOURCE_ID,
	PRODUCT_PREFIX,
} from "alchemy-utils/worker-peer-scripts";
import { chatroomWorker } from "chatroom-do/alchemy";
import { otherWorker } from "other-worker/alchemy";
import { pingWorker } from "ping-do/alchemy";
import { defaultPosthogReleaseName, resolvePosthogReleaseBuild } from "./posthog/release-names";
import { resolvePosthogReleaseVersion } from "./posthog/release-version";

const stage = resolveStageFromEnv();

/** One id per **`alchemy deploy`** so bindings match **`posthog-cli --build`** in the build subprocess (local uses a timestamp). */
const posthogReleaseBuild =
	process.env["POSTHOG_RELEASE_BUILD"]?.trim() ||
	resolvePosthogReleaseBuild(process.env, stage) ||
	"";
if (posthogReleaseBuild) {
	process.env["POSTHOG_RELEASE_BUILD"] = posthogReleaseBuild;
}
const app = await alchemy(ALCHEMY_APP_IDS.frontend, {
	stage,
	...alchemyCiCloudStateStoreOptions(stage),
});
requireAlchemyPassword(app);
const chatroomInternalSecretRaw = requireEnv(
	"CHATROOM_INTERNAL_SECRET",
	"Shared secret used when the web worker forwards /api/ws/* to the chatroom DO",
	app,
);
const chatroomInternalSecret = alchemy.secret(chatroomInternalSecretRaw);
const ChatroomDo = chatroomWorker.bindings.ChatroomDo;
const PingDo = pingWorker.bindings.PingDo;

const skipWebCustomHostnames = isPrStage(stage);
const webDomains = skipWebCustomHostnames ? [] : [...reactRouterDomainsFromProcessEnv()];
const webRoutes = skipWebCustomHostnames ? [] : [...reactRouterRoutesFromProcessEnv()];

/** Portless `--name`: `PRODUCT_PREFIX` + same segment as `ReactRouter(...)` resource id (`web` ⇒ e.g. `starter-web`). */
const localWebPortlessRouteName = `${PRODUCT_PREFIX}-${DEFAULT_REACT_ROUTER_WEB_RESOURCE_ID}`;

/** `LOCAL_PORTLESS` in repo-root `.env.local`: omit or `on` (default) ⇒ Portless; `off` ⇒ plain `http://localhost`. */
function isLocalPortlessExplicitlyDisabled(): boolean {
	return process.env["LOCAL_PORTLESS"]?.trim().toLowerCase() === "off";
}

const usePortlessLocalDev = stage === "local" && !isLocalPortlessExplicitlyDisabled();

/** `PORT` when set and positive; otherwise `undefined`. */
function explicitPortFromEnv(env: NodeJS.ProcessEnv): number | undefined {
	const raw = Number(env["PORT"]?.trim());
	return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : undefined;
}

const explicitListenPort = explicitPortFromEnv(process.env);
/** Portless: honor `PORT`, else `get-port` from 5173 on 127.0.0.1. Otherwise unused for `dev` command — `5173` matches Vite default. */
const localDevListenPort = usePortlessLocalDev
	? (explicitListenPort ?? (await pickListenPort({ preferred: 5173, host: "127.0.0.1" })))
	: (explicitListenPort ?? 5173);

/** `portless run` then `react-router dev` (Turbo `dev` already runs `typegen:local` where configured). */
const portlessWrappedLocalDev = usePortlessLocalDev
	? `portless run --name ${localWebPortlessRouteName} --app-port ${localDevListenPort} bunx react-router dev --port ${localDevListenPort}`
	: undefined;

/** Turbo **`deploy:*`** depends on **`typegen`** (see **`turbo.json`**) — this is **`react-router build`** only. */
const reactRouterProductionBuild = "bun run react-router build";
/** Only deployed stages: inject/upload maps when CLI env is set (same signals as **`vite.config.ts`** hidden maps). */
const posthogSourcemapUploadAfterBuild =
	stage !== "local" &&
	Boolean(process.env["POSTHOG_CLI_TOKEN"]?.trim() || process.env["POSTHOG_CLI_API_KEY"]?.trim()) &&
	Boolean(
		process.env["POSTHOG_CLI_ENV_ID"]?.trim() || process.env["POSTHOG_CLI_PROJECT_ID"]?.trim(),
	);

export const web = await ReactRouter(DEFAULT_REACT_ROUTER_WEB_RESOURCE_ID, {
	main: "workers/app.ts",
	compatibility: "node",
	placement: { mode: "smart" },
	build: posthogSourcemapUploadAfterBuild
		? `${reactRouterProductionBuild} && bun posthog/upload-sourcemaps.ts`
		: reactRouterProductionBuild,
	url: true,
	adopt: true,
	routes: webRoutes,
	domains: webDomains,
	bindings: {
		DB: mainDb,
		CHATROOM_INTERNAL_SECRET: chatroomInternalSecret,
		ChatroomDo,
		PingDo,
		PING: pingWorker,
		OTHER: otherWorker,
		STAGE: stage,
		POSTHOG_KEY: readProcessEnvTrimmed("POSTHOG_KEY"),
		POSTHOG_HOST: readProcessEnvTrimmed("POSTHOG_HOST"),
		POSTHOG_SITE: readProcessEnvTrimmed("POSTHOG_SITE"),
		/** Symbol-set name — see **`posthog/release-names.ts`**. */
		POSTHOG_RELEASE_NAME: defaultPosthogReleaseName(stage, process.env),
		/** Git / workflow commit id — **`posthog-cli` `--release-version`**; browser combines with **`POSTHOG_RELEASE_BUILD`** for **`logs.serviceVersion`**. */
		POSTHOG_RELEASE_VERSION: resolvePosthogReleaseVersion(process.env),
		/** **`posthog-cli` `--build`** (CI run number or **`local-<ms>`**) — packed into **`logs.serviceVersion`** as **`version+build`**. */
		POSTHOG_RELEASE_BUILD: posthogReleaseBuild,
	},
	...(portlessWrappedLocalDev ? { dev: portlessWrappedLocalDev } : {}),
});

const portlessRaw = process.env["PORTLESS_URL"]?.trim();

/**
 * Prefer env when Portless exposes it (`PORTLESS_URL` is injected on the `react-router dev`
 * child process, but often absent in the `alchemy` process that evaluates this file after `web` updates —
 * hence the `https://<name>.localhost` fallback matching `portless --name`).
 */
const portlessDerivedPublicBase =
	stage === "local" && portlessWrappedLocalDev
		? `https://${localWebPortlessRouteName}.localhost`
		: undefined;
const portlessDevPublicUrl = (() => {
	if (stage !== "local") {
		return undefined;
	}
	const fromEnv = portlessRaw ? `${portlessRaw.replace(/\/$/, "")}/` : undefined;
	const fromFlag = portlessDerivedPublicBase ? `${portlessDerivedPublicBase}/` : undefined;
	return fromEnv ?? fromFlag;
})();

console.log({ webUrl: portlessDevPublicUrl ?? web.url });
/** GitHub Actions: write URL for deploy workflows — see **`CI_WEB_DEPLOY_URL_RELPATH`**. */
if (process.env["GITHUB_ACTIONS"] === "true" && web.url) {
	const root = process.env["GITHUB_WORKSPACE"]?.trim();
	if (root) {
		const filePath = path.join(root, CI_WEB_DEPLOY_URL_RELPATH);
		mkdirSync(path.dirname(filePath), { recursive: true });
		writeFileSync(filePath, `${web.url.trim()}\n`, "utf8");
	}
}

// PR preview comments belong in `.github/workflows/pr-deploy.yml`. Avoid `alchemy/github`
// `GitHubComment` here on CI + `STAGE=pr-*` — `verifyGitHubAuth` often 404s for fork/private PRs.

await app.finalize();
