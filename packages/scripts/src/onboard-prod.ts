#!/usr/bin/env bun
/**
 * Production CI bootstrap: gh auth, Cloudflare keys in `.env.production`, generated secrets, `github:sync:prod`, repo variable for auto production PR gate.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { confirm, isCancel } from "@clack/prompts";

import { printCloudflareManualHints } from "./onboarding/cloudflare-manual-hints";
import {
	captureEnvAssignmentValue,
	hasCloudflareDeployCredentials,
	upsertPlainEnvKv,
} from "./onboarding/dotenv-helpers";
import { githubActionsUrl } from "./onboarding/gh-actions-url";
import { assertGhAuthenticated } from "./onboarding/gh-auth";

const root = resolve(import.meta.dir, "../../..");
const prodFile = `${root}/.env.production`;
const stagingFile = `${root}/.env.staging`;

const AUTO_PROD_PR_VAR = "CF_STARTER_AUTO_PRODUCTION_PR";

const inheritStdio: ["inherit", "inherit", "inherit"] = ["inherit", "inherit", "inherit"];

function runOrExit(cmd: string[], label: string): void {
	const r = Bun.spawnSync(cmd, {
		cwd: root,
		stdio: inheritStdio,
		env: process.env,
	});
	if (r.exitCode !== 0) {
		console.error(`[onboard:prod] ${label} failed (exit ${r.exitCode ?? 1}).`);
		process.exit(r.exitCode ?? 1);
	}
}

function copyStagingCloudflareIntoProd(stagingRaw: string, prodRaw: string): string {
	const token = captureEnvAssignmentValue(stagingRaw, "CLOUDFLARE_API_TOKEN");
	const account = captureEnvAssignmentValue(stagingRaw, "CLOUDFLARE_ACCOUNT_ID");
	if (!token || !account) {
		throw new Error("staging file is missing Cloudflare token or account id");
	}
	let out = prodRaw;
	out = upsertPlainEnvKv(out, "CLOUDFLARE_API_TOKEN", token);
	out = upsertPlainEnvKv(out, "CLOUDFLARE_ACCOUNT_ID", account);
	return out;
}

async function shouldCopyStagingCf(stagingHas: boolean, prodHas: boolean): Promise<boolean> {
	if (!stagingHas || prodHas) {
		return false;
	}
	if (process.env["ONBOARD_PROD_COPY_CF"] === "1") {
		return true;
	}
	if (process.stdin.isTTY && process.stdout.isTTY) {
		const c = await confirm({
			message:
				"Copy CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID from `.env.staging` into `.env.production`? (Typical when production deploys to the same Cloudflare account as staging.)",
			initialValue: true,
		});
		if (isCancel(c)) {
			console.error("[onboard:prod] Cancelled.");
			process.exit(130);
		}
		return c;
	}
	console.error(
		"[onboard:prod] `.env.production` is missing Cloudflare credentials; `.env.staging` has them.",
	);
	console.error(
		"Non-interactive shell: re-run with ONBOARD_PROD_COPY_CF=1 to copy, or paste keys into `.env.production`.",
	);
	console.error(
		"Teams that need account/token isolation should paste separate production credentials instead.",
	);
	process.exit(1);
	return false;
}

async function main(): Promise<void> {
	assertGhAuthenticated(root);

	const stagingRaw = existsSync(stagingFile) ? readFileSync(stagingFile, "utf8") : "";
	let prodRaw = existsSync(prodFile) ? readFileSync(prodFile, "utf8") : "";

	const stagingCf = hasCloudflareDeployCredentials(stagingRaw);
	let prodCf = hasCloudflareDeployCredentials(prodRaw);

	if (!prodCf) {
		if (await shouldCopyStagingCf(stagingCf, prodCf)) {
			try {
				const header =
					"# Cloudflare credentials copied from .env.staging by onboard:prod — use separate prod IAM if your org requires it.\n\n";
				const base =
					prodRaw.trim() === "" ? header : prodRaw.endsWith("\n") ? prodRaw : `${prodRaw}\n`;
				prodRaw = copyStagingCloudflareIntoProd(stagingRaw, base);
				writeFileSync(prodFile, prodRaw, "utf8");
				prodCf = true;
			} catch (e) {
				console.error("[onboard:prod] Could not copy Cloudflare keys from staging:", e);
				process.exit(1);
			}
		}
	}

	if (!prodCf) {
		console.error("[onboard:prod] Missing Cloudflare credentials in `.env.production`.");
		console.error("");
		printCloudflareManualHints("production");
		console.error("");
		console.error(
			"Use separate production credentials if your organization requires isolation or narrower IAM.",
		);
		console.error("Or run interactively: bun run setup:prod");
		process.exit(1);
	}

	runOrExit(["bun", "run", "setup:prod", "--", "--yes"], "setup:prod --yes");
	runOrExit(["bun", "run", "github:sync:prod"], "github:sync:prod");

	const setVar = Bun.spawnSync(["gh", "variable", "set", AUTO_PROD_PR_VAR, "--body", "true"], {
		cwd: root,
		stdio: inheritStdio,
		env: process.env,
	});
	if (setVar.exitCode !== 0) {
		console.error(
			`[onboard:prod] Could not set repository variable ${AUTO_PROD_PR_VAR}=true via gh.`,
		);
		console.error(
			"Production may still be synced; set the variable manually: gh variable set CF_STARTER_AUTO_PRODUCTION_PR (body: true)",
		);
		process.exit(setVar.exitCode ?? 1);
	}

	const actions = githubActionsUrl(root);
	const prList = (() => {
		const r = spawnSync("gh", ["repo", "view", "--json", "url", "-q", ".url"], {
			cwd: root,
			encoding: "utf8",
		});
		const base = r.stdout?.trim();
		return base ? `${base.replace(/\/$/, "")}/pulls` : null;
	})();

	console.log("");
	console.log(
		"Production is configured on GitHub. After a successful **staging** deploy, this repo may open or reuse a PR **`main` → `production`** when needed.",
	);
	console.log(
		"Merge that PR to deploy production (see `.github/workflows/deploy-production.yml`).",
	);
	console.log("");
	console.log(
		`Repository variable **${AUTO_PROD_PR_VAR}** is **true** — staging can propose production PRs (still requires a \`production\` branch on the remote).`,
	);
	if (actions) {
		console.log(`GitHub Actions: ${actions}`);
	}
	if (prList) {
		console.log(`Pull requests: ${prList}`);
	}
	console.log("");
}

void main().catch((e) => {
	console.error(e);
	process.exit(1);
});
