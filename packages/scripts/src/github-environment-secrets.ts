/**
 * GitHub Actions **environment** configuration for deploy (CI + `github:sync:*`).
 *
 * Required / optional keys are defined in `collected-env-requirements.ts` (sidecars + repo root).
 * `CF_STARTER_DEPLOY_ENABLED` stays a special case: optional in the dotfile; `github:sync` defaults it to `"true"` on GitHub.
 *
 * Keep in sync with `deploy-preflight.ts`, `.github/workflows/deploy-*.yml`, `stacks/admin.ts`, and `turbo.json` **`globalEnv`**.
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
export const CF_STARTER_DEPLOY_ENABLED_VAR = "CF_STARTER_DEPLOY_ENABLED" as const;

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
 * `CF_STARTER_DEPLOY_ENABLED` is optional in the file — sync always pushes `true` to GitHub when you run `github:sync:*` (unless the dotfile sets a value, which is preserved).
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
	const deployFlag = env[CF_STARTER_DEPLOY_ENABLED_VAR]?.trim();
	const payload = {
		...requiredPayload,
		...optionalPayload,
		...(deployFlag ? { [CF_STARTER_DEPLOY_ENABLED_VAR]: deployFlag } : {}),
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
