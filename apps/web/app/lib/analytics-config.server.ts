import { parsePrNumberFromStage } from "alchemy-utils/deployment-stage";
import {
	defaultPosthogUiHostForRegion,
	POSTHOG_INGEST_API_PATH,
	posthogRegionFromProcessEnv,
} from "alchemy-utils/posthog-host";

import type { PostHogRuntimeTags } from "~/lib/posthog-runtime-tags";
import { defaultPosthogReleaseName } from "../../posthog/release-names";
import { posthogLogsServiceVersion } from "../../posthog/release-version";

/**
 * Optional PostHog helpers for the web Worker — unused at runtime until `POSTHOG_KEY` / bindings exist and the UI opts in.
 *
 * Bindings read for optional PostHog (matches web Worker env subset).
 */
export type PostHogWorkerEnvSlice = {
	STAGE?: string;
	POSTHOG_KEY?: string;
	POSTHOG_UI_HOST?: string;
	POSTHOG_REGION?: string;
	POSTHOG_SITE?: string;
	/** Bound in **`alchemy.run.ts`** from **`STAGE`** + git (not dotenv). */
	POSTHOG_RELEASE_NAME?: string;
	POSTHOG_RELEASE_VERSION?: string;
	/** Optional; bound with **`posthog-cli` `--build`**. Combined into **`logs.serviceVersion`** as **`version+build`**. */
	POSTHOG_RELEASE_BUILD?: string;
};

function resolvePosthogUiHost(workerEnv: PostHogWorkerEnvSlice): string {
	const explicit = (workerEnv.POSTHOG_UI_HOST ?? "").trim();
	if (explicit) {
		return explicit;
	}
	return defaultPosthogUiHostForRegion(posthogRegionFromProcessEnv(workerEnv));
}

/** OTel-style value for PostHog **`logs.environment`** from Alchemy **`STAGE`** slug. */
export function posthogDeploymentEnvironment(stageSlug: string): string {
	const s = stageSlug.trim();
	if (s === "prod") {
		return "production";
	}
	if (s === "staging") {
		return "staging";
	}
	if (s.startsWith("pr-")) {
		return "preview";
	}
	if (s === "local") {
		return "development";
	}
	return "development";
}

export function getPostHogRuntimeTags(workerEnv: PostHogWorkerEnvSlice): PostHogRuntimeTags {
	const slug = (workerEnv.STAGE ?? "").trim() || "unknown";
	const pr = parsePrNumberFromStage(slug);
	return {
		deploy_stage: slug,
		preview_pr_number: pr ?? null,
		deployment_environment: posthogDeploymentEnvironment(slug),
	};
}

/**
 * Public PostHog config for the browser. When **`POSTHOG_KEY`** is unset, analytics is off.
 */
export function getPostHogClientConfig(workerEnv: PostHogWorkerEnvSlice): {
	enabled: boolean;
	key: string;
	host: string;
	uiHost: string;
	site: string;
	releaseName: string;
	releaseVersion: string;
} {
	const key = (workerEnv.POSTHOG_KEY ?? "").trim();
	const site = (workerEnv.POSTHOG_SITE ?? "").trim();
	const slug = (workerEnv.STAGE ?? "").trim() || "unknown";
	const releaseName =
		(workerEnv.POSTHOG_RELEASE_NAME ?? "").trim() || defaultPosthogReleaseName(slug);
	const releaseVersionBase = (workerEnv.POSTHOG_RELEASE_VERSION ?? "").trim();
	const releaseBuild = (workerEnv.POSTHOG_RELEASE_BUILD ?? "").trim();
	const releaseVersion = posthogLogsServiceVersion(releaseVersionBase, releaseBuild || undefined);

	if (!key) {
		return {
			enabled: false,
			key: "",
			host: "",
			uiHost: "",
			site: "",
			releaseName,
			releaseVersion,
		};
	}
	const uiHost = resolvePosthogUiHost(workerEnv);
	return {
		enabled: true,
		key,
		host: POSTHOG_INGEST_API_PATH,
		uiHost,
		site,
		releaseName,
		releaseVersion,
	};
}
