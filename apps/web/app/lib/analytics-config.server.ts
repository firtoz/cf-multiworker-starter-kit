import { parsePrNumberFromStage } from "alchemy-utils/deployment-stage";

import type { PostHogRuntimeTags } from "~/lib/posthog-runtime-tags";

/**
 * Optional PostHog helpers for the web Worker — unused at runtime until `POSTHOG_KEY` / bindings exist and the UI opts in.
 *
 * Bindings read for optional PostHog (matches web Worker env subset).
 */
export type PostHogWorkerEnvSlice = {
	STAGE?: string;
	POSTHOG_KEY?: string;
	POSTHOG_HOST?: string;
};

/** Default PostHog ingest host (US). */
export const POSTHOG_DEFAULT_INGEST_HOST = "https://us.i.posthog.com";

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
	assetsPreconnectHref: string | null;
} {
	const key = (workerEnv.POSTHOG_KEY ?? "").trim();
	if (!key) {
		return { enabled: false, key: "", host: "", assetsPreconnectHref: null };
	}
	const host = (workerEnv.POSTHOG_HOST ?? "").trim() || POSTHOG_DEFAULT_INGEST_HOST;
	const assetsPreconnectHref =
		host.includes("eu.i.posthog") || host.includes("eu.posthog.com")
			? "https://eu-assets.i.posthog.com"
			: "https://us-assets.i.posthog.com";
	return { enabled: true, key, host, assetsPreconnectHref };
}
