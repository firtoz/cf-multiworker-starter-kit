import type { EnvRequirement } from "alchemy-utils/env-requirements";

/**
 * Repo-wide env (not owned by a single app package). See `apps/web/env.requirements.ts` for web-only keys.
 *
 * **GitHub repo policy** (Environment rules, rulesets, merge settings) lives in
 * **`config/github.policy.ts`** — not here.
 *
 * `DEPLOY_ENABLED` is handled specially in `github-environment-secrets.ts` (optional in dotfile; sync defaults to `"true"`).
 */
export const REPO_ROOT_ENV_REQUIREMENTS: readonly EnvRequirement[] = [
	{
		key: "ALCHEMY_PASSWORD",
		setupCategory: "alchemy-chatroom",
		kind: "secret",
		requiredIn: ["local", "staging", "prod"],
		githubSync: "required",
		title: "Alchemy password",
		description:
			"Encrypts Alchemy state on disk / in CI (see https://alchemy.run/concepts/secret/#encryption-password).",
		canAutoGenerate: true,
	},
	{
		key: "ALCHEMY_STATE_TOKEN",
		setupCategory: "alchemy-chatroom",
		kind: "secret",
		requiredIn: ["staging", "prod"],
		optionalSetupModes: [],
		githubSync: "required",
		title: "Alchemy Cloud state token",
		description:
			"One stable token per Cloudflare account for CI state (see https://alchemy.run/guides/cloudflare-state-store/); same value in staging + prod github:sync secrets",
		canAutoGenerate: true,
	},
	{
		key: "CHATROOM_INTERNAL_SECRET",
		setupCategory: "alchemy-chatroom",
		kind: "secret",
		requiredIn: ["local", "staging", "prod"],
		githubSync: "required",
		title: "Chatroom internal secret",
		description: "Authorizes the web worker when it forwards WebSocket upgrades to the chatroom DO",
		canAutoGenerate: true,
	},
	{
		key: "CLOUDFLARE_API_TOKEN",
		setupCategory: "cloudflare",
		kind: "secret",
		requiredIn: ["staging", "prod"],
		optionalSetupModes: [],
		githubSync: "required",
		title: "Cloudflare API token",
		description: "Workers + D1 — e.g. Edit Cloudflare Workers template",
	},
	{
		key: "CLOUDFLARE_ACCOUNT_ID",
		setupCategory: "cloudflare",
		kind: "variable",
		requiredIn: ["staging", "prod"],
		optionalSetupModes: [],
		githubSync: "required",
		title: "Cloudflare account ID",
		description: "Dashboard → account / Workers overview (synced as a GitHub Environment variable)",
		plaintextInSetup: true,
	},
	{
		key: "GITHUB_SYNC_PUSH_SECRETS",
		setupCategory: "github-sync-cli",
		kind: "variable",
		requiredIn: [],
		optionalSetupModes: ["staging", "prod"],
		githubSync: "never",
		title: "GitHub sync — push secrets & Environment variables",
		description:
			"**Optional.** **`true`** / **`false`**. **Default when unset, empty, or whitespace:** **`true`** (same as omitting the key)—**`github:sync:*`** uploads GitHub **secrets** and Environment **variables** and requires a complete stage dotfile. Accepted truthy strings (case-insensitive): **`true`**, **`1`**, **`yes`**, **`on`**. Falsy: **`false`**, **`0`**, **`no`**, **`off`**—then sync still updates **RepositoryEnvironment** shells and staging repo / ruleset policy from **`config/github.policy.ts`** but **does not** upload secrets or variables; dotfile optional. Other values error. Prefer **`bun run github:sync:config`** / **`github:sync:config:*`** (same as **`false`** without relying on this key).",
		plaintextInSetup: true,
	},
	{
		key: "GITHUB_SYNC_STAGING_FORK_REVIEWERS_PRIVATE",
		setupCategory: "github-sync-cli",
		kind: "variable",
		requiredIn: [],
		optionalSetupModes: ["staging", "prod"],
		githubSync: "never",
		title: "GitHub sync — staging-fork actor reviewer on private repos",
		description:
			'**Optional.** When **`github.environments.stagingFork.reviewerFallbackToActor`** is **`"auto"`** and the repo is **private**, set **`true`** / **`1`** / **`yes`** / **`on`** so **`github:sync:*`** / **`github:env:staging`** injects the current **`gh`** login as a required reviewer on **`staging-fork`** (empty reviewer lists). Omit or **`false`** on Free private repos to avoid **422** from required reviewers. **Public**/**internal** repos do not need this key.',
		plaintextInSetup: true,
	},
];
