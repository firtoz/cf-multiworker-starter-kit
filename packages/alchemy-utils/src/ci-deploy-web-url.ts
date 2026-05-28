import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isPrStage } from "./deployment-stage";
import { commaSeparatedEnvSegments, WEB_DOMAINS_ENV_KEY } from "./web-deploy-hostnames";

/**
 * The web app writes its public deploy URL here during GitHub Actions
 * (**`GITHUB_ACTIONS`**, **`GITHUB_WORKSPACE`** repo root).
 *
 * Prefers **`WEB_DOMAINS`** when set (non-PR stages); otherwise Alchemy **`workers.dev`** URL.
 *
 * **`.alchemy/`** is repo-**gitignored** — this never shows up as an untracked path for normal tooling.
 *
 * Deploy workflows **read this same path**; keep paths in sync with this constant.
 */
export const CI_WEB_DEPLOY_URL_RELPATH = ".alchemy/ci/web-deploy-url.txt" as const;

/** Canonical Better Auth public URL written during auth-worker deploy on CI (same ladder as `resolveAuthBaseUrl`). */
export const CI_AUTH_DEPLOY_URL_RELPATH = ".alchemy/ci/auth-deploy-url.txt" as const;

/**
 * GitHub Actions job summary snippet for PostHog source maps (written during **`alchemy deploy`** / upload).
 * Workflows append **`GITHUB_WORKSPACE`** / this path to **`GITHUB_STEP_SUMMARY`**.
 */
export const CI_POSTHOG_SOURCEMAPS_SUMMARY_RELPATH =
	".alchemy/ci/posthog-sourcemaps-summary.md" as const;

export type ResolvePublicWebUrlForCiOptions = {
	readonly stage: string;
	readonly env?: NodeJS.ProcessEnv;
	/** Alchemy `web.url` after deploy — always **workers.dev** when set. */
	readonly workersDevUrl: string | undefined;
};

/** Public web app URL for CI summaries and PR comments — custom domain when configured. */
export function resolvePublicWebUrlForCi(
	options: ResolvePublicWebUrlForCiOptions,
): string | undefined {
	const workersDev = options.workersDevUrl?.trim();
	if (!workersDev) {
		return undefined;
	}

	const env = options.env ?? process.env;
	if (!isPrStage(options.stage)) {
		const webHost = commaSeparatedEnvSegments(env[WEB_DOMAINS_ENV_KEY])[0];
		if (webHost) {
			return `https://${webHost}`;
		}
	}

	return workersDev;
}

/** Write a single-line deploy URL artifact when running in GitHub Actions. */
export function writeCiDeployUrlIfGithubActions(relpath: string, url: string | undefined): void {
	const trimmed = url?.trim();
	if (process.env["GITHUB_ACTIONS"] !== "true" || !trimmed) {
		return;
	}
	const root = process.env["GITHUB_WORKSPACE"]?.trim();
	if (!root) {
		return;
	}
	const filePath = path.join(root, relpath);
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${trimmed}\n`, "utf8");
}
