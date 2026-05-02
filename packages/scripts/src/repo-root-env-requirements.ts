import type { EnvRequirement } from "alchemy-utils/env-requirements";

/**
 * Repo-wide env (not owned by a single app package). See `apps/web/env.requirements.ts` for web-only keys.
 *
 * `CF_STARTER_DEPLOY_ENABLED` is handled specially in `github-environment-secrets.ts` (optional in dotfile; sync defaults to `"true"`).
 */
export const REPO_ROOT_ENV_REQUIREMENTS: readonly EnvRequirement[] = [
	{
		key: "ALCHEMY_PASSWORD",
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
		kind: "secret",
		requiredIn: ["local", "staging", "prod"],
		githubSync: "required",
		title: "Chatroom internal secret",
		description: "Authorizes the web worker when it forwards WebSocket upgrades to the chatroom DO",
		canAutoGenerate: true,
	},
	{
		key: "CLOUDFLARE_API_TOKEN",
		kind: "secret",
		requiredIn: ["staging", "prod"],
		optionalSetupModes: [],
		githubSync: "required",
		title: "Cloudflare API token",
		description: "Workers + D1 — e.g. Edit Cloudflare Workers template",
	},
	{
		key: "CLOUDFLARE_ACCOUNT_ID",
		kind: "variable",
		requiredIn: ["staging", "prod"],
		optionalSetupModes: [],
		githubSync: "required",
		title: "Cloudflare account ID",
		description: "Dashboard → account / Workers overview (synced as a GitHub Environment variable)",
		plaintextInSetup: true,
	},
];
