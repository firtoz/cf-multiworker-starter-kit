#!/usr/bin/env bun
/**
 * Optional starter-only: upload client source maps to PostHog for error tracking. Skip entirely if you do not use PostHog.
 *
 * Uses the official **`@posthog/cli`** package (`bunx @posthog/cli`), not the unrelated npm **`posthog-cli`** name.
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

import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { resolveStageFromEnv } from "alchemy-utils/deployment-stage";

import { appendPosthogSourcemapsCiSummary } from "./ci-summary-artifact";
import { defaultPosthogReleaseName, resolvePosthogReleaseBuild } from "./release-names";
import { resolvePosthogReleaseVersion } from "./release-version";

const DEFAULT_POSTHOG_CLI_HOST = "https://us.posthog.com";

/** Log/summary limit — full output stays in Actions log; summary stays readable. */
const MAX_POSTHOG_CLI_LOG_CHARS = 12_000;
const MAX_POSTHOG_CLI_SUMMARY_CHARS = 2_000;

function coerceShellOutput(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}
	if (Buffer.isBuffer(value)) {
		return value.toString("utf8");
	}
	if (value instanceof Uint8Array) {
		return new TextDecoder().decode(value);
	}
	return "";
}

function extractFailureDetail(err: unknown): {
	text: string;
	exitCode?: number;
	/** If true, CLI already printed to this step’s stdout/stderr (spawn inherit). */
	streamed: boolean;
} {
	if (!err || typeof err !== "object") {
		return { text: err instanceof Error ? err.message : String(err), streamed: false };
	}
	const o = err as Record<string, unknown>;
	const stderr = coerceShellOutput(o["stderr"]).trim();
	const stdout = coerceShellOutput(o["stdout"]).trim();
	if (stderr || stdout) {
		const msg = err instanceof Error ? err.message : "Command failed";
		const body = stderr || stdout || msg;
		const rawExit = o["exitCode"];
		const exitCode = typeof rawExit === "number" ? rawExit : undefined;
		if (exitCode === undefined) {
			return { text: body, streamed: false };
		}
		return { text: body, exitCode, streamed: false };
	}
	const rawExit = o["exitCode"];
	if (typeof rawExit === "number") {
		const msg = err instanceof Error ? err.message : "posthog-cli failed";
		return { text: msg, exitCode: rawExit, streamed: true };
	}
	return { text: err instanceof Error ? err.message : String(err), streamed: false };
}

async function runPosthogCliWithInheritedStdio(
	args: string[],
	env: NodeJS.ProcessEnv,
): Promise<void> {
	const code = await new Promise<number>((resolve, reject) => {
		const child = spawn("bunx", ["@posthog/cli", ...args], {
			env,
			cwd: process.cwd(),
			stdio: "inherit",
		});
		child.on("error", reject);
		child.on("close", (c) => {
			resolve(c ?? 1);
		});
	});
	if (code !== 0) {
		throw Object.assign(new Error(`posthog-cli exited with code ${String(code)}`), {
			exitCode: code,
		});
	}
}

function trimText(s: string, max: number): string {
	const t = s.trim();
	if (t.length <= max) {
		return t;
	}
	return `${t.slice(0, max)}\n… (truncated)`;
}

/** Indented block avoids broken Markdown if stderr contains triple backticks. */
function markdownIndentedBlock(text: string): string {
	return text
		.split("\n")
		.map((line) => `    ${line}`)
		.join("\n");
}

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
		const injectArgs = [
			"--host",
			posthogHost,
			"sourcemap",
			"inject",
			"--directory",
			buildDir,
			"--release-name",
			releaseName,
			"--release-version",
			releaseVersion,
			...(releaseBuild ? ["--build", releaseBuild] : []),
		];
		const uploadArgs = [
			"--host",
			posthogHost,
			"sourcemap",
			"upload",
			"--directory",
			buildDir,
			"--release-name",
			releaseName,
			"--release-version",
			releaseVersion,
			...(releaseBuild ? ["--build", releaseBuild] : []),
			"--delete-after",
		];

		console.log("[PostHog source maps] Running @posthog/cli inject… (stdio → step log)");
		await runPosthogCliWithInheritedStdio(injectArgs, env);

		console.log("[PostHog source maps] Running @posthog/cli upload… (stdio → step log)");
		await runPosthogCliWithInheritedStdio(uploadArgs, env);
		console.log("[PostHog source maps] RESULT: SUCCESS — maps uploaded (local .map files removed)");
		console.log("------------------------------------------------------------------------");
		const releaseLine = releaseBuild
			? `- **Release:** \`${releaseName}\` · \`${releaseVersion}\` · build \`${releaseBuild}\``
			: `- **Release:** \`${releaseName}\` · \`${releaseVersion}\``;
		appendUploadCiSummary([
			"- **Result:** success — maps uploaded (local `.map` files removed)",
			releaseLine,
		]);
	} catch (err: unknown) {
		const { text, exitCode, streamed } = extractFailureDetail(err);
		console.warn("[PostHog source maps] RESULT: FAILED (non-fatal for deploy) — posthog-cli");
		if (!streamed) {
			const forLog = trimText(text, MAX_POSTHOG_CLI_LOG_CHARS);
			console.warn(forLog);
		} else if (exitCode !== undefined) {
			console.warn(
				`[PostHog source maps] Exit code: ${String(exitCode)} (see CLI output above in this step)`,
			);
		}
		console.warn(
			"[PostHog source maps] Fix CLI credentials / host (US vs EU) / network; stacks stay minified until upload works.",
		);
		console.log("------------------------------------------------------------------------");
		const summaryLines = [
			"- **Result:** failed (non-fatal for deploy)",
			...(exitCode === undefined ? [] : [`- **Exit code:** \`${String(exitCode)}\``]),
			`- **Host:** \`${posthogHost}\``,
			...(streamed
				? [
						"- **posthog-cli:** full output is in **this deploy step log** (live stdout/stderr from the CLI).",
					]
				: [
						"- **posthog-cli output (trimmed):**",
						"",
						markdownIndentedBlock(trimText(text, MAX_POSTHOG_CLI_SUMMARY_CHARS)),
						"",
					]),
			"- **Hint:** token scope, **`POSTHOG_CLI_HOST`** (e.g. EU vs US), and job networking.",
		];
		appendUploadCiSummary(summaryLines);
		process.exit(0);
	}
}

await main();
