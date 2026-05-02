#!/usr/bin/env bun
/**
 * Guided CI/deploy enablement — does not write secrets itself; delegates to `setup:*` and `github:sync:*`.
 */
import { cancel, intro, isCancel, note, outro, select } from "@clack/prompts";

const argv = process.argv;
const stagingOnly = argv.includes("--staging");
const prodOnly = argv.includes("--prod");

async function main() {
	intro("cf-multiworker — GitHub Actions deploy enablement");

	if (stagingOnly) {
		note(
			[
				"**Staging / PR previews** use GitHub Environment `staging` and repo-root `.env.staging`.",
				"",
				"1. `gh auth login` (repo scope).",
				"2. `bun run setup:staging` — fill Alchemy, chatroom, and Cloudflare keys.",
				"3. `bun run github:sync:staging` — creates/updates the environment; upserts **secrets** + **variables** (incl. `CF_STARTER_DEPLOY_ENABLED`, default `true`).",
				"",
				"PR preview workflows reuse **staging** secrets; each preview uses `STAGE=pr-<number>` in CI only.",
			].join("\n"),
			"github:setup:staging",
		);
		outro("When `.env.staging` is ready, run `bun run github:sync:staging` from the repo root.");
		return;
	}

	if (prodOnly) {
		note(
			[
				"**Production** uses GitHub Environment `production` and repo-root `.env.production`.",
				"",
				"1. `gh auth login` (repo scope).",
				"2. `bun run setup:prod` — fill all deploy keys.",
				"3. `bun run github:sync:prod` — syncs **secrets** + **variables** (incl. `CF_STARTER_DEPLOY_ENABLED`) to **production**.",
				"",
				"Production deploys run on pushes to branch `production` (see `.github/workflows/deploy-production.yml`).",
			].join("\n"),
			"github:setup:prod",
		);
		outro("When `.env.production` is ready, run `bun run github:sync:prod` from the repo root.");
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
				"**Local dev (no GitHub needed):** `bun run setup` / `setup:local` → default **.env.local**.",
				"",
				"**Staging:** `bun run setup:staging` then `bun run github:sync:staging`",
				"**Production:** `bun run setup:prod` then `bun run github:sync:prod`",
				"",
				"Fresh forks: deploy workflows stay **green** until you set variable `CF_STARTER_DEPLOY_ENABLED=true` on each GitHub Environment (`staging` / `production`). The admin stack sets that when you run `github:sync:*`.",
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
				"`bun run setup:staging` then `bun run github:sync:staging`",
			].join("\n"),
			"Step A",
		);
	}

	if (scope === "prod" || scope === "both") {
		note(
			[
				"**Production** — `.env.production` + GitHub Environment `production`.",
				"`bun run setup:prod` then `bun run github:sync:prod`",
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
		"Run the `setup:*` and `github:sync:*` commands above when ready. Until then, CI quality jobs still pass.",
	);
}

await main();
