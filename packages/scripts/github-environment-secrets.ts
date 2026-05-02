/**
 * GitHub Actions **environment** configuration for deploy (CI + `github:sync:*`).
 *
 * - **Secrets** — `ALCHEMY_PASSWORD`, `ALCHEMY_STATE_TOKEN`, `CHATROOM_INTERNAL_SECRET`, `CLOUDFLARE_API_TOKEN`
 * - **Variables** (plaintext on GitHub Environment) — `CLOUDFLARE_ACCOUNT_ID`, `CF_STARTER_DEPLOY_ENABLED`, and optional **`WEB_*`** hostname keys synced when set in the stage dotfile (see [`alchemy-utils/web-deploy-hostnames`](../alchemy-utils/web-deploy-hostnames.ts)). **Fork PR previews** are blocked unless a **repository** Actions variable **`CF_STARTER_ALLOW_PREVIEW_FOR_FORK_PRS=true`** is set (Settings → Secrets and variables → Actions → Variables — not the `staging` Environment; jobs without `environment:` cannot read Environment vars).
 *
 * Keep in sync with `deploy-preflight.ts`, `.github/workflows/deploy-*.yml`, and `stacks/admin.ts`.
 */
import { GITHUB_SYNC_OPTIONAL_WEB_HOSTNAME_VARIABLE_KEYS } from "alchemy-utils/web-deploy-hostnames";

export const GITHUB_ENVIRONMENT_SECRET_KEYS = [
	"ALCHEMY_PASSWORD",
	"ALCHEMY_STATE_TOKEN",
	"CHATROOM_INTERNAL_SECRET",
	"CLOUDFLARE_API_TOKEN",
] as const;

export type GitHubEnvironmentSecretKey = (typeof GITHUB_ENVIRONMENT_SECRET_KEYS)[number];

/** Synced as GitHub Environment **variables** (not `GitHubSecret`). */
export const GITHUB_ENVIRONMENT_VARIABLE_KEYS = [
	"CLOUDFLARE_ACCOUNT_ID",
	"CF_STARTER_DEPLOY_ENABLED",
] as const;

export type GitHubEnvironmentVariableKey = (typeof GITHUB_ENVIRONMENT_VARIABLE_KEYS)[number];

/** Plaintext environment variable (not secret) — opt-in deploy gate for CI; `github:sync` sets it to `"true"`. */
export const CF_STARTER_DEPLOY_ENABLED_VAR = "CF_STARTER_DEPLOY_ENABLED" as const;

export function buildGitHubSecretPayload(env: Record<string, string | undefined>): {
	payload: Record<string, string>;
	missing: string[];
} {
	const missing: string[] = [];
	const payload: Record<string, string> = {};
	for (const k of GITHUB_ENVIRONMENT_SECRET_KEYS) {
		const v = env[k]?.trim();
		if (v) {
			payload[k] = v;
		} else {
			missing.push(k);
		}
	}
	return { payload, missing };
}

/**
 * Variables read from the stage dotfile for `stacks/admin.ts`.
 * `CF_STARTER_DEPLOY_ENABLED` is optional in the file — sync always pushes `true` to GitHub when you run `github:sync:*`.
 */
export function buildGitHubVariablePayloadFromDotfile(env: Record<string, string | undefined>): {
	payload: Record<string, string>;
	missing: string[];
} {
	const missing: string[] = [];
	const payload: Record<string, string> = {};

	const accountId = env["CLOUDFLARE_ACCOUNT_ID"]?.trim();
	if (accountId) {
		payload["CLOUDFLARE_ACCOUNT_ID"] = accountId;
	} else {
		missing.push("CLOUDFLARE_ACCOUNT_ID");
	}

	const deployFlag = env[CF_STARTER_DEPLOY_ENABLED_VAR]?.trim();
	if (deployFlag) {
		payload[CF_STARTER_DEPLOY_ENABLED_VAR] = deployFlag;
	}
	// Caller adds default `true` for CF_STARTER_DEPLOY_ENABLED when syncing if not in dotfile

	for (const name of GITHUB_SYNC_OPTIONAL_WEB_HOSTNAME_VARIABLE_KEYS) {
		const v = env[name]?.trim();
		if (v) {
			payload[name] = v;
		}
	}

	return { payload, missing };
}

/** Every key required for a successful deploy / preflight (secrets + account id). */
export function missingDeployConfigurationKeys(
	env: Record<string, string | undefined>,
	options?: { requiresAlchemyStateToken?: boolean },
): string[] {
	const { missing: missingSecrets } = buildGitHubSecretPayload(env);
	const accountId = env["CLOUDFLARE_ACCOUNT_ID"]?.trim();
	const missing = [...missingSecrets];
	if (!accountId) {
		missing.push("CLOUDFLARE_ACCOUNT_ID");
	}
	if (options?.requiresAlchemyStateToken) {
		if (!env["ALCHEMY_STATE_TOKEN"]?.trim()) {
			missing.push("ALCHEMY_STATE_TOKEN");
		}
	}
	return missing;
}

/**
 * Guided setup CLI label for a repo-root dotfile path.
 */
export function setupCommandLabelForDotfileRel(
	dotfileRel: string,
): "bun run setup:local" | "bun run setup:staging" | "bun run setup:prod" {
	const t = dotfileRel.trim().toLowerCase();
	if (t.endsWith(".env.local")) {
		return "bun run setup:local";
	}
	if (t.endsWith(".env.staging")) {
		return "bun run setup:staging";
	}
	return "bun run setup:prod";
}
