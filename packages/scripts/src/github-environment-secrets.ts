/**
 * GitHub Actions **environment** configuration for deploy (CI + `github:sync:*`).
 *
 * Required / optional keys are defined in `collected-env-requirements.ts` (sidecars + repo root).
 * **`DEPLOY_ENABLED`** — optional in the dotfile; `github:sync` defaults it to `"true"` on GitHub when unset.
 * **`AUTO_PRODUCTION_PR`** — optional in the dotfile; **`github:sync:*`** defaults it to **`"true"`** on GitHub Environment **staging** when unset (set **`false`** to disable auto **main → production** PRs).
 *
 * Keep in sync with `deploy-preflight.ts`, `.github/workflows/*-deploy.yml`, `main-push.yml`, `stacks/admin.ts`, and `turbo.json` **`globalEnv`**.
 */
import {
	buildGitHubOptionalSecretPayload,
	buildGitHubOptionalVariablePayload,
	buildGitHubRequiredSecretPayload,
	buildGitHubRequiredVariablePayload,
	missingDeployConfigurationKeysFromRequirements,
} from "alchemy-utils/env-requirements";
import { ALL_REPO_ENV_REQUIREMENTS } from "./collected-env-requirements";

/** Plaintext environment variable (not secret) — opt-in deploy gate for CI; `github:sync` sets it to `"true"`. */
export const DEPLOY_ENABLED_VAR = "DEPLOY_ENABLED" as const;

/** Optional — when **`true`**, **`main-push`** may open/reuse **main → production** after a successful staging deploy (GitHub Environment **staging**). */
export const AUTO_PRODUCTION_PR_VAR = "AUTO_PRODUCTION_PR" as const;

export function buildGitHubSecretPayload(env: Record<string, string | undefined>): {
	payload: Record<string, string>;
	missing: string[];
} {
	return buildGitHubRequiredSecretPayload(ALL_REPO_ENV_REQUIREMENTS, env);
}

export function buildOptionalGitHubSecretPayload(
	env: Record<string, string | undefined>,
): Record<string, string> {
	return buildGitHubOptionalSecretPayload(ALL_REPO_ENV_REQUIREMENTS, env);
}

/**
 * Variables read from the stage dotfile for `stacks/admin.ts`.
 * **`DEPLOY_ENABLED`** is optional in the file — sync always pushes `true` to GitHub when you run `github:sync:*` (unless the dotfile sets a value, which is preserved).
 * **`AUTO_PRODUCTION_PR`** is optional — sync defaults it to **`"true"`** on GitHub when unset (same idea as **`DEPLOY_ENABLED`**); set **`false`** in the dotfile to disable. Production-stage sync still mirrors an explicit prod-dotfile value to Environment **staging** (see `stacks/admin.ts`).
 */
export function buildGitHubVariablePayloadFromDotfile(env: Record<string, string | undefined>): {
	payload: Record<string, string>;
	missing: string[];
} {
	const { payload: requiredPayload, missing } = buildGitHubRequiredVariablePayload(
		ALL_REPO_ENV_REQUIREMENTS,
		env,
	);
	const optionalPayload = buildGitHubOptionalVariablePayload(ALL_REPO_ENV_REQUIREMENTS, env);
	const deployFlag = env[DEPLOY_ENABLED_VAR]?.trim();
	const payload = {
		...requiredPayload,
		...optionalPayload,
		...(deployFlag ? { [DEPLOY_ENABLED_VAR]: deployFlag } : {}),
	};
	return { payload, missing };
}

/** Every key required for a successful deploy / preflight (secrets + account id). */
export function missingDeployConfigurationKeys(
	env: Record<string, string | undefined>,
	options?: { requiresAlchemyStateToken?: boolean },
): string[] {
	return missingDeployConfigurationKeysFromRequirements(ALL_REPO_ENV_REQUIREMENTS, env, options);
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
