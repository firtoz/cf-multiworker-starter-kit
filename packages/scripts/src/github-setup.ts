#!/usr/bin/env bun
/**
 * Guided CI/deploy enablement — does not write secrets itself; delegates to `setup:*` and `github:sync:*`.
 */
import { cancel, intro, isCancel, note, outro, select } from "@clack/prompts";

import { GITHUB_POLICY_HINT_LINES } from "./github-policy-hints";

const argv = process.argv;
const stagingOnly = argv.includes("--staging");
const prodOnly = argv.includes("--prod");

async function main() {
	intro("GitHub Actions deploy enablement");

	if (stagingOnly) {
		note(
			[
				"**Staging / PR previews** use GitHub Environment `staging` and repo-root `.env.staging`.",
				"",
				"1. Create a Cloudflare **API token** + copy **Account ID** (see repo **docs/github-admin.md** — **Cloudflare credentials (manual)**).",
				"2. `gh auth login` (repo scope).",
				"3. `bun run onboard:staging` — verifies the above, fills missing generated keys (`setup:staging --yes`), runs `github:sync:staging`.",
				"",
				"**Same steps without the wrapper:** `bun run setup:staging` then `bun run github:sync:staging`.",
				"",
				"**Deployment rules only (no new secrets/variables on GitHub):** after **`gh auth login`**, **`bun run github:env:staging`** — applies **`RepositoryEnvironment`** from **`config/github.policy.ts`** (merges **`.env.staging`** if present for other local env).",
				"PR preview workflows reuse **staging** secrets; each preview uses `STAGE=pr-<number>` in CI only.",
				"",
				...GITHUB_POLICY_HINT_LINES,
			].join("\n"),
			"github:setup:staging",
		);
		outro(
			"Prefer **`bun run onboard:staging`** from the repo root (rerunnable). README → **Deploy with GitHub Actions (optional)**.",
		);
		return;
	}

	if (prodOnly) {
		note(
			[
				"**Production** uses GitHub Environment `production` and repo-root `.env.production`.",
				"",
				"1. Create Cloudflare **API token** + **Account ID** for production (often the same as staging — see README).",
				"2. `gh auth login` (repo scope).",
				"3. `bun run onboard:prod` — `setup:prod --yes`, then **`github:sync:prod`** (**`AUTO_PRODUCTION_PR`** defaults to **`true`** on GitHub **staging**; set **`false`** in a dotfile to disable).",
				"",
				"**Same steps without the wrapper:** `bun run setup:prod` then `bun run github:sync:prod` — set **`AUTO_PRODUCTION_PR`** in **`.env.staging`** or **`.env.production`** under **GitHub admin CLI** in the variable browser (optional).",
				"**Deployment rules only:** `bun run github:env:prod` — same **`config/github.policy.ts`** for **`production`** (merges **`.env.production`** if present). Tune policy in your editor; run **`bun run typecheck`** after edits.",
				"Production deploys run on pushes to branch `production` (see `.github/workflows/prod-deploy.yml`).",
				"",
				...GITHUB_POLICY_HINT_LINES,
			].join("\n"),
			"github:setup:prod",
		);
		outro(
			"Prefer **`bun run onboard:prod`** from the repo root. README → **Deploy with GitHub Actions (optional)**.",
		);
		return;
	}

	const scope = await select({
		message: "What do you want to enable?",
		options: [
			{ value: "both" as const, label: "Staging + production (full walkthrough)" },
			{ value: "staging" as const, label: "Staging / PR previews only" },
			{ value: "prod" as const, label: "Production only" },
			{ value: "doc" as const, label: "Just show the commands (I will run them myself)" },
		],
		initialValue: "both",
	});

	if (isCancel(scope) || !scope) {
		cancel("Cancelled.");
		process.exit(0);
	}

	if (scope === "doc") {
		note(
			[
				"**Local dev:** `bun run quickstart` (or `setup:local` / `bun run dev`).",
				"",
				"**Staging:** `bun run onboard:staging` (or `setup:staging` then `github:sync:staging`)",
				"**Production:** `bun run onboard:prod` (or `setup:prod` then `github:sync:prod`)",
				"**Repo + Environment shells only (no secrets/variables on GitHub):** `bun run github:sync:config` or `GITHUB_SYNC_PUSH_SECRETS=false` with `github:sync:*`",
				"**Deployment rules only:** `bun run github:env:staging` / `github:env:prod`, or **`github:env`** — updates **`RepositoryEnvironment`** from **`config/github.policy.ts`** (stage dotfile optional). Does not push secrets or GitHub Environment variables.",
				"",
				...GITHUB_POLICY_HINT_LINES,
				"",
				"Fresh forks: deploy workflows stay **green** until you set variable `DEPLOY_ENABLED=true` on each deploy Environment (`staging` / `production`). The admin stack sets that when you run **`github:sync`** / **`github:sync:*`**. Fork PRs run Quality only and do not receive deploy secrets.",
			].join("\n"),
			"Command reference",
		);
		outro("Done.");
		return;
	}

	if (scope === "staging" || scope === "both") {
		note(
			[
				"**Staging** — `.env.staging` + GitHub Environment `staging`.",
				"`bun run onboard:staging`",
			].join("\n"),
			"Step A",
		);
	}

	if (scope === "prod" || scope === "both") {
		note(
			[
				"**Production** — `.env.production` + GitHub Environment `production`.",
				"`bun run onboard:prod`",
			].join("\n"),
			scope === "both" ? "Step B" : "Step",
		);
	}

	if (scope === "both") {
		note(
			[
				"Use **different** strong values for `ALCHEMY_PASSWORD` per environment if you want isolation (recommended).",
			].join("\n"),
			"Tip",
		);
	}

	outro(
		"Run **`bun run onboard:staging`** / **`onboard:prod`** when ready (or the manual `setup:*` + `github:sync:*` pairs). Until then, CI quality jobs still pass.",
	);
}

await main();
