import type { EnvRequirement } from "alchemy-utils/env-requirements";
import {
	GITHUB_SYNC_OPTIONAL_WEB_HOSTNAME_VARIABLE_KEYS,
	WEB_DOMAIN_OVERRIDE_EXISTING_ORIGIN_ENV_KEY,
	WEB_DOMAINS_ENV_KEY,
	WEB_ROUTES_ENV_KEY,
	WEB_ZONE_ID_ENV_KEY,
} from "alchemy-utils/web-deploy-hostnames";

const webHostnameRequirements: readonly EnvRequirement[] = [
	{
		key: WEB_DOMAINS_ENV_KEY,
		setupCategory: "custom-domains",
		kind: "variable",
		requiredIn: [],
		optionalSetupModes: ["staging", "prod"],
		githubSync: "optional",
		title: "Web Worker custom domains (optional)",
		description:
			"Comma-separated hostname(s), e.g. example.com,www.example.com · empty = workers.dev only · see README · synced as GitHub var when set",
		plaintextInSetup: true,
	},
	{
		key: WEB_ROUTES_ENV_KEY,
		setupCategory: "custom-domains",
		kind: "variable",
		requiredIn: [],
		optionalSetupModes: ["staging", "prod"],
		githubSync: "optional",
		title: "Web Worker routes (optional)",
		description:
			"Comma-separated patterns, e.g. example.com/* — use when you need route patterns instead of domains only",
		plaintextInSetup: true,
	},
	{
		key: WEB_ZONE_ID_ENV_KEY,
		setupCategory: "custom-domains",
		kind: "variable",
		requiredIn: [],
		optionalSetupModes: ["staging", "prod"],
		githubSync: "optional",
		title: "Cloudflare zone ID for web hostname bindings (optional)",
		description:
			"Applied to every WEB_DOMAINS / WEB_ROUTES entry when set · omit to let Alchemy infer from hostnames",
		plaintextInSetup: true,
	},
	{
		key: WEB_DOMAIN_OVERRIDE_EXISTING_ORIGIN_ENV_KEY,
		setupCategory: "custom-domains",
		kind: "variable",
		requiredIn: [],
		optionalSetupModes: ["staging", "prod"],
		githubSync: "optional",
		title: "Override existing Worker on custom domain(s) (optional)",
		description:
			"true / false · set true only if hostname is bound to another Worker and you intentionally want to replace it",
		plaintextInSetup: true,
	},
];

const localDevRequirements: readonly EnvRequirement[] = [
	{
		key: "LOCAL_PORTLESS",
		setupCategory: "local-dev",
		kind: "variable",
		requiredIn: [],
		optionalSetupModes: ["local"],
		githubSync: "never",
		title: "Wrap local dev with Portless (HTTPS `*.localhost`)",
		description:
			"`on` or omit (default): `alchemy dev` runs Vite behind `portless run` (`--name` = `PRODUCT_PREFIX` + SSR `web` in `alchemy.run.ts`, e.g. `starter-web`). `off`: plain `http://localhost:<port>` only.",
		plaintextInSetup: true,
	},
];

/**
 * Optional product analytics (PostHog) — same as other starter samples: leave every key empty to ship without analytics,
 * or delete this block + related `app/` helpers / bindings if you remove PostHog entirely.
 */
const posthogRequirements: readonly EnvRequirement[] = [
	{
		key: "POSTHOG_KEY",
		setupCategory: "analytics",
		kind: "variable",
		requiredIn: [],
		optionalSetupModes: ["local", "staging", "prod"],
		githubSync: "optional",
		title: "PostHog project API key (optional analytics)",
		description:
			"PostHog → Project settings · omit to disable browser analytics · GitHub Env **variable**, not Secret",
		plaintextInSetup: true,
	},
	{
		key: "POSTHOG_HOST",
		setupCategory: "analytics",
		kind: "variable",
		requiredIn: [],
		optionalSetupModes: ["local", "staging", "prod"],
		githubSync: "optional",
		title: "PostHog ingest host (optional)",
		description:
			"e.g. `https://us.i.posthog.com` or `https://eu.i.posthog.com` · GitHub Environment **variable**",
		plaintextInSetup: true,
	},
	{
		key: "POSTHOG_SITE",
		setupCategory: "analytics",
		kind: "variable",
		requiredIn: [],
		optionalSetupModes: ["local", "staging", "prod"],
		githubSync: "optional",
		title: "PostHog site identifier (optional)",
		description:
			"Stable site/project slug registered as PostHog `site` on every event · useful when one PostHog project tracks multiple sites",
		plaintextInSetup: true,
	},
	{
		key: "POSTHOG_CLI_TOKEN",
		setupCategory: "analytics",
		kind: "secret",
		requiredIn: [],
		optionalSetupModes: ["staging", "prod"],
		githubSync: "optional",
		title: "PostHog CLI token (optional — source maps)",
		description:
			"Personal API key (`error_tracking:write`) · GitHub **secret** · alias **`POSTHOG_CLI_API_KEY`** · source maps run in **staging/prod/preview** deploys only — not local dev",
	},
	{
		key: "POSTHOG_CLI_ENV_ID",
		setupCategory: "analytics",
		kind: "variable",
		requiredIn: [],
		optionalSetupModes: ["staging", "prod"],
		githubSync: "optional",
		title: "PostHog web environment ID (optional — CLI)",
		description:
			"Numeric project id from PostHog URL · alias **`POSTHOG_CLI_PROJECT_ID`** per [CLI](https://posthog.com/docs/error-tracking/upload-source-maps/cli)",
		plaintextInSetup: true,
	},
	{
		key: "POSTHOG_CLI_HOST",
		setupCategory: "analytics",
		kind: "variable",
		requiredIn: [],
		optionalSetupModes: ["staging", "prod"],
		githubSync: "optional",
		title: "PostHog CLI app host (optional)",
		description:
			"US `https://us.posthog.com` · EU `https://eu.posthog.com` · not `*.i.posthog.com`",
		plaintextInSetup: true,
	},
];

/** Keys declared here must match bindings in {@link ./alchemy.run.ts}. */
export const WEB_APP_ENV_REQUIREMENTS: readonly EnvRequirement[] = [
	...localDevRequirements,
	...webHostnameRequirements,
	...posthogRequirements,
];

/** Sanity: every WEB hostname env used for GitHub sync is declared. */
for (const k of GITHUB_SYNC_OPTIONAL_WEB_HOSTNAME_VARIABLE_KEYS) {
	if (!webHostnameRequirements.some((r) => r.key === k)) {
		throw new Error(`WEB_APP_ENV_REQUIREMENTS out of sync: missing ${k}`);
	}
}
