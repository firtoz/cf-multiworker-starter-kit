import {
	ALCHEMY_APP_IDS,
	DEFAULT_REACT_ROUTER_WEB_RESOURCE_ID,
} from "alchemy-utils/worker-peer-scripts";

import { resolvePosthogDeploySource } from "./deploy-origin";

/**
 * PostHog **`--release-name`** / `logs.serviceName` — derived from this deployable only (no manual env).
 *
 * - **`local`** (Alchemy stage) → `{app}-web-local` (browser analytics may still run; source maps are off for local).
 * - **`staging`** / **`prod`** / **`pr-<n>`** → base name on **CI**; same stages from a **laptop** get a **`-local`** suffix
 *   so source maps / symbol sets do not collide with pipeline deploys.
 *
 * **`env`** omitted (e.g. Worker fallback when a binding is missing) → base name only, no channel suffix.
 *
 * Several real apps in one PostHog project: use different Alchemy frontend ids / **`PRODUCT_PREFIX`** so names stay distinct.
 */
export function defaultPosthogReleaseName(stage: string, env?: NodeJS.ProcessEnv): string {
	const base = `${ALCHEMY_APP_IDS.frontend}-${DEFAULT_REACT_ROUTER_WEB_RESOURCE_ID}-${stage}`;
	if (stage === "local") {
		return base;
	}
	if (env === undefined) {
		return base;
	}
	if (resolvePosthogDeploySource(env) === "ci") {
		return base;
	}
	return `${base}-local`;
}

/**
 * **`posthog-cli sourcemap --build`**: GitHub **`GITHUB_RUN_NUMBER`** (or attempt) on CI; a unique
 * **`local-<ms>`** id for laptop deploys to **`staging`** / **`prod`** / **`pr-*`** so repeated pushes do not
 * clobber the same release version.
 */
export function resolvePosthogReleaseBuild(
	env: NodeJS.ProcessEnv = process.env,
	stage: string,
): string | undefined {
	const trimmedStage = stage.trim();
	if (trimmedStage === "local") {
		return undefined;
	}
	const fromGh = env["GITHUB_RUN_NUMBER"]?.trim() || env["GITHUB_RUN_ATTEMPT"]?.trim();
	if (fromGh) {
		return fromGh;
	}
	if (resolvePosthogDeploySource(env) === "local") {
		return `local-${Date.now()}`;
	}
	return undefined;
}
