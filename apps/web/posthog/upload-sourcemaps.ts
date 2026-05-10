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

import { defaultPosthogReleaseName, resolvePosthogReleaseBuild } from "./release-names";
import { resolvePosthogReleaseVersion } from "./release-version";

const DEFAULT_POSTHOG_CLI_HOST = "https://us.posthog.com";

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
	const posthogToken =
		process.env["POSTHOG_CLI_TOKEN"]?.trim() || process.env["POSTHOG_CLI_API_KEY"]?.trim();
	const posthogEnvId =
		process.env["POSTHOG_CLI_ENV_ID"]?.trim() || process.env["POSTHOG_CLI_PROJECT_ID"]?.trim();
	const posthogHost = process.env["POSTHOG_CLI_HOST"]?.trim() || DEFAULT_POSTHOG_CLI_HOST;

	if (!posthogToken || !posthogEnvId) {
		console.log(
			"⏭️  Skipping source map upload (set POSTHOG_CLI_API_KEY + POSTHOG_CLI_PROJECT_ID, or legacy POSTHOG_CLI_TOKEN + POSTHOG_CLI_ENV_ID)",
		);
		process.exit(0);
	}

	const buildDir = path.resolve(process.cwd(), "build/client");
	if (!fs.existsSync(buildDir)) {
		console.error(`❌ Build directory not found: ${buildDir}`);
		console.error("   Run production build from apps/web first (`bun run build:prod`, etc.).");
		process.exit(1);
	}

	if (!hasMapFiles(buildDir)) {
		console.warn(
			"⚠️  No .map files under build/client. Rebuild with PostHog CLI env set so Vite emits hidden client source maps.",
		);
		process.exit(0);
	}

	const stage = resolveStageFromEnv();
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
	console.log(
		`\n🗺️  PostHog source maps: release-name=${releaseName} release-version=${releaseVersion}${buildSuffix}\n`,
	);

	try {
		console.log("   Injecting (chunk / release metadata)…");
		if (releaseBuild) {
			await $`bunx posthog-cli --host ${posthogHost} sourcemap inject --directory ${buildDir} --release-name ${releaseName} --release-version ${releaseVersion} --build ${releaseBuild}`.env(
				env,
			);
		} else {
			await $`bunx posthog-cli --host ${posthogHost} sourcemap inject --directory ${buildDir} --release-name ${releaseName} --release-version ${releaseVersion}`.env(
				env,
			);
		}

		console.log("   Uploading…");
		if (releaseBuild) {
			await $`bunx posthog-cli --host ${posthogHost} sourcemap upload --directory ${buildDir} --release-name ${releaseName} --release-version ${releaseVersion} --build ${releaseBuild} --delete-after`.env(
				env,
			);
		} else {
			await $`bunx posthog-cli --host ${posthogHost} sourcemap upload --directory ${buildDir} --release-name ${releaseName} --release-version ${releaseVersion} --delete-after`.env(
				env,
			);
		}
		console.log("✓ Source maps uploaded (local .map files removed after upload)\n");
	} catch {
		console.warn(
			"⚠️  Source map upload failed (non-fatal). Client errors in PostHog may lack readable stacks.\n",
		);
		process.exit(0);
	}
}

await main();
