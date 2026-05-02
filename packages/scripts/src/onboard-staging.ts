#!/usr/bin/env bun
/**
 * One-command staging CI bootstrap: gh auth, Cloudflare keys in `.env.staging`, generated secrets, `github:sync:staging`.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { printCloudflareManualHints } from "./onboarding/cloudflare-manual-hints";
import { hasCloudflareDeployCredentials } from "./onboarding/dotenv-helpers";
import { githubActionsUrl } from "./onboarding/gh-actions-url";
import { assertGhAuthenticated } from "./onboarding/gh-auth";

const root = resolve(import.meta.dir, "../../..");
const stagingFile = `${root}/.env.staging`;

const inheritStdio: ["inherit", "inherit", "inherit"] = ["inherit", "inherit", "inherit"];

function runOrExit(cmd: string[], label: string): void {
	const r = Bun.spawnSync(cmd, {
		cwd: root,
		stdio: inheritStdio,
		env: process.env,
	});
	if (r.exitCode !== 0) {
		console.error(`[onboard:staging] ${label} failed (exit ${r.exitCode ?? 1}).`);
		process.exit(r.exitCode ?? 1);
	}
}

function main(): void {
	assertGhAuthenticated(root);

	const stagingRaw = existsSync(stagingFile) ? readFileSync(stagingFile, "utf8") : "";
	if (!hasCloudflareDeployCredentials(stagingRaw)) {
		console.error("[onboard:staging] Missing Cloudflare credentials in `.env.staging`.");
		console.error("");
		printCloudflareManualHints("staging");
		console.error("");
		console.error("Or run interactively: bun run setup:staging");
		process.exit(1);
	}

	runOrExit(["bun", "run", "setup:staging", "--", "--yes"], "setup:staging --yes");
	runOrExit(["bun", "run", "github:sync:staging"], "github:sync:staging");

	const actions = githubActionsUrl(root);
	console.log("");
	console.log(
		"All good: the next push or merge to `main` deploys staging after **Quality checks** complete.",
	);
	if (actions) {
		console.log(`GitHub Actions: ${actions}`);
	} else {
		console.log(
			"GitHub Actions: open the **Actions** tab on your repo (install `gh` for a direct link next time).",
		);
	}
	console.log("");
}

main();
