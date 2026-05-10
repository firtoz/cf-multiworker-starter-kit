#!/usr/bin/env bun
/**
 * Optional starter-only: upload client source maps to PostHog for error tracking. Skip entirely if you do not use PostHog.
 *
 * **Alchemy deploy:** `alchemy.run.ts` runs this after `react-router build` so debug IDs are injected before assets ship.
 *
 * Prerequisites: **`build/client`** with `.map` files. When **`POSTHOG_CLI_TOKEN`** / **`POSTHOG_CLI_API_KEY`**
 * and **`POSTHOG_CLI_ENV_ID`** / **`POSTHOG_CLI_PROJECT_ID`** are set,
 * **`vite.config.ts`** enables **`hidden`** client source maps (maps on disk, not exposed in served JS — see
 * [PostHog + Vite](https://posthog.com/docs/error-tracking/upload-source-maps/react)).
 *
 * **`--release-name`** / **`--release-version`** / **`--build`** are computed from **`STAGE`**, git, GitHub Actions, and
 * whether the job is **CI** vs a **developer machine** — not from dotenv (local stage never runs this; maps stay off in Vite for **`local`**).
 *
 * Manual run (from **`apps/web`**, **`STAGE`** set — deployed stages only):
 *   bunx dotenv-cli -v STAGE=prod -e ../../.env.production -- bun posthog/upload-sourcemaps.ts
 * Or: **`bun run sourcemap:upload`** after a build that had those env vars.
 */

import fs from "node:fs";
import path from "node:path";

import { resolveStageFromEnv } from "alchemy-utils/deployment-stage";
import { $ } from "bun";

import { appendPosthogSourcemapsCiSummary } from "./ci-summary-artifact";
import { defaultPosthogReleaseName, resolvePosthogReleaseBuild } from "./release-names";
import { resolvePosthogReleaseVersion } from "./release-version";

const DEFAULT_POSTHOG_CLI_HOST = "https://us.posthog.com";

function appendUploadCiSummary(bodyLines: string[]): void {
	appendPosthogSourcemapsCiSummary(
		["**Upload** (`posthog/upload-sourcemaps.ts`)", "", ...bodyLines].join("\n"),
	);
}

function hasMapFiles(dir: string): boolean {
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	for (const e of entries) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) {
			if (hasMapFiles(p)) {
				return true;
			}
		} else if (e.name.endsWith(".map")) {
			return true;
		}
	}
	return false;
}

async function main() {
	console.log("");
	console.log("------------------------------------------------------------------------");
	console.log("[PostHog source maps] upload script started (posthog/upload-sourcemaps.ts)");
	console.log("------------------------------------------------------------------------");

	const stage = resolveStageFromEnv();

	const posthogToken =
		process.env["POSTHOG_CLI_TOKEN"]?.trim() || process.env["POSTHOG_CLI_API_KEY"]?.trim();
	const posthogEnvId =
		process.env["POSTHOG_CLI_ENV_ID"]?.trim() || process.env["POSTHOG_CLI_PROJECT_ID"]?.trim();
	const posthogHost = process.env["POSTHOG_CLI_HOST"]?.trim() || DEFAULT_POSTHOG_CLI_HOST;

	if (!posthogToken || !posthogEnvId) {
		console.log("[PostHog source maps] RESULT: SKIPPED — missing PostHog CLI credentials");
		console.log(
			"[PostHog source maps] Set POSTHOG_CLI_API_KEY + POSTHOG_CLI_PROJECT_ID (or legacy POSTHOG_CLI_TOKEN + POSTHOG_CLI_ENV_ID).",
		);
		console.log("------------------------------------------------------------------------");
		appendUploadCiSummary([
			"- **Result:** skipped — missing PostHog CLI credentials (token or project id).",
		]);
		process.exit(0);
	}

	const buildDir = path.resolve(process.cwd(), "build/client");
	if (!fs.existsSync(buildDir)) {
		console.error("[PostHog source maps] RESULT: ERROR — build directory missing");
		console.error(`[PostHog source maps] Expected: ${buildDir}`);
		console.error(
			"[PostHog source maps] Run a production build from apps/web first (e.g. bun run build:prod).",
		);
		console.log("------------------------------------------------------------------------");
		appendUploadCiSummary([
			"- **Result:** error — `build/client` missing",
			`- **Expected:** \`${buildDir}\``,
		]);
		process.exit(1);
	}

	if (!hasMapFiles(buildDir)) {
		console.warn("[PostHog source maps] RESULT: SKIPPED — no .map files under build/client");
		console.warn(
			"[PostHog source maps] Rebuild with full PostHog CLI env + non-local STAGE so Vite sets sourcemap: hidden.",
		);
		console.log("------------------------------------------------------------------------");
		appendUploadCiSummary([
			"- **Result:** skipped — no `.map` files under `build/client`",
			"- **Hint:** ensure `STAGE` is non-local and PostHog CLI env is set before `vite build`.",
		]);
		process.exit(0);
	}
	const releaseName = defaultPosthogReleaseName(stage, process.env);
	const releaseVersion = resolvePosthogReleaseVersion(process.env);
	const releaseBuild =
		process.env["POSTHOG_RELEASE_BUILD"]?.trim() || resolvePosthogReleaseBuild(process.env, stage);

	const env = {
		...process.env,
		POSTHOG_CLI_TOKEN: posthogToken,
		POSTHOG_CLI_API_KEY: posthogToken,
		POSTHOG_CLI_ENV_ID: posthogEnvId,
		POSTHOG_CLI_PROJECT_ID: posthogEnvId,
		POSTHOG_CLI_HOST: posthogHost,
	};

	const buildSuffix = releaseBuild ? ` build=${releaseBuild}` : "";
	console.log("[PostHog source maps] Injecting + uploading for:");
	console.log(`[PostHog source maps]   release-name=${releaseName}`);
	console.log(`[PostHog source maps]   release-version=${releaseVersion}${buildSuffix}`);

	try {
		console.log("[PostHog source maps] Running posthog-cli inject…");
		if (releaseBuild) {
			await $`bunx posthog-cli --host ${posthogHost} sourcemap inject --directory ${buildDir} --release-name ${releaseName} --release-version ${releaseVersion} --build ${releaseBuild}`.env(
				env,
			);
		} else {
			await $`bunx posthog-cli --host ${posthogHost} sourcemap inject --directory ${buildDir} --release-name ${releaseName} --release-version ${releaseVersion}`.env(
				env,
			);
		}

		console.log("[PostHog source maps] Running posthog-cli upload…");
		if (releaseBuild) {
			await $`bunx posthog-cli --host ${posthogHost} sourcemap upload --directory ${buildDir} --release-name ${releaseName} --release-version ${releaseVersion} --build ${releaseBuild} --delete-after`.env(
				env,
			);
		} else {
			await $`bunx posthog-cli --host ${posthogHost} sourcemap upload --directory ${buildDir} --release-name ${releaseName} --release-version ${releaseVersion} --delete-after`.env(
				env,
			);
		}
		console.log("[PostHog source maps] RESULT: SUCCESS — maps uploaded (local .map files removed)");
		console.log("------------------------------------------------------------------------");
		const releaseLine = releaseBuild
			? `- **Release:** \`${releaseName}\` · \`${releaseVersion}\` · build \`${releaseBuild}\``
			: `- **Release:** \`${releaseName}\` · \`${releaseVersion}\``;
		appendUploadCiSummary([
			"- **Result:** success — maps uploaded (local `.map` files removed)",
			releaseLine,
		]);
	} catch {
		console.warn("[PostHog source maps] RESULT: FAILED (non-fatal for deploy stack trace below)");
		console.warn(
			"[PostHog source maps] Fix CLI credentials / network; errors in PostHog may show minified stacks until upload succeeds.",
		);
		console.log("------------------------------------------------------------------------");
		appendUploadCiSummary([
			"- **Result:** failed (non-fatal for deploy) — see job log for `posthog-cli` output",
			"- **Hint:** check CLI token permissions and network; stacks in PostHog may stay minified until upload works.",
		]);
		process.exit(0);
	}
}

await main();
