#!/usr/bin/env bun
/**
 * Optional starter-only: upload client source maps to PostHog for error tracking. Skip entirely if you do not use PostHog.
 *
 * Prerequisites: production build with `.map` under `build/client`. Set **`POSTHOG_CLI_TOKEN`** and
 * **`POSTHOG_CLI_ENV_ID`** in repo-root env (same file as **`bun run build:prod`** loads) so Vite emits hidden maps.
 *
 * Add a **`sourcemap:upload`** script to **`package.json`** when you use this (see comment below).
 *
 * Usage (from **`apps/web`**, with **`STAGE`** set — match deploy scripts):
 *   bunx dotenv-cli -v STAGE=prod -e ../../.env.production -- bun scripts/upload-sourcemaps.ts
 */

import fs from "node:fs";
import path from "node:path";

import { resolveStageFromEnv } from "alchemy-utils/deployment-stage";
import {
	ALCHEMY_APP_IDS,
	DEFAULT_REACT_ROUTER_WEB_RESOURCE_ID,
} from "alchemy-utils/worker-peer-scripts";
import { $ } from "bun";

const DEFAULT_POSTHOG_CLI_HOST = "https://us.posthog.com";

function workerScriptPhysicalName(stage: string): string {
	return `${ALCHEMY_APP_IDS.frontend}-${DEFAULT_REACT_ROUTER_WEB_RESOURCE_ID}-${stage}`;
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
	const posthogToken = process.env.POSTHOG_CLI_TOKEN?.trim();
	const posthogEnvId = process.env.POSTHOG_CLI_ENV_ID?.trim();
	const posthogHost = process.env.POSTHOG_CLI_HOST?.trim() || DEFAULT_POSTHOG_CLI_HOST;

	if (!posthogToken || !posthogEnvId) {
		console.log("⏭️  Skipping source map upload (POSTHOG_CLI_TOKEN and POSTHOG_CLI_ENV_ID not set)");
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
			"⚠️  No .map files under build/client. Rebuild with POSTHOG_CLI_TOKEN and POSTHOG_CLI_ENV_ID in env so Vite emits client source maps.",
		);
		process.exit(0);
	}

	const stage = resolveStageFromEnv();
	const workerName = workerScriptPhysicalName(stage);
	let version: string;
	try {
		version = (await $`git rev-parse --short HEAD`.text()).trim();
	} catch {
		version = `deploy-${Date.now()}`;
	}

	const env = {
		...process.env,
		POSTHOG_CLI_TOKEN: posthogToken,
		POSTHOG_CLI_ENV_ID: posthogEnvId,
		POSTHOG_CLI_HOST: posthogHost,
	};

	console.log(`\n🗺️  PostHog source maps: project=${workerName} version=${version}\n`);

	try {
		console.log("   Injecting debug IDs…");
		await $`bunx posthog-cli --host ${posthogHost} sourcemap inject --directory ${buildDir} --project ${workerName} --version ${version}`.env(
			env,
		);
		console.log("   Uploading…");
		await $`bunx posthog-cli --host ${posthogHost} sourcemap upload --directory ${buildDir} --delete-after`.env(
			env,
		);
		console.log("✓ Source maps uploaded (local .map files removed after upload)\n");
	} catch {
		console.warn(
			"⚠️  Source map upload failed (non-fatal). Client errors in PostHog may lack readable stacks.\n",
		);
		process.exit(0);
	}
}

await main();
