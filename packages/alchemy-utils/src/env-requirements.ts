/**
 * Declarative env requirements for repo-root dotfiles, `setup:*`, and `github:sync:*`.
 * Import these from sidecar modules — not from `alchemy.run.ts` (which has Alchemy side effects).
 */

export type EnvSetupMode = "local" | "staging" | "prod";

/** How a key is mirrored to GitHub Environments by `stacks/admin.ts`. */
export type GitHubSyncPolicy = "required" | "optional" | "never";

export type EnvRequirement = {
	readonly key: string;
	readonly kind: "secret" | "variable";
	/** Modes where this key must be non-empty (setup + deploy preflight where applicable). */
	readonly requiredIn: readonly EnvSetupMode[];
	/**
	 * Modes where the key appears in setup as optional (may be empty).
	 * Example: PostHog and `WEB_*` hostname vars.
	 */
	readonly optionalSetupModes?: readonly EnvSetupMode[];
	/** `false` to hide from setup entirely (default true if required or optional for that mode). */
	readonly setup?: boolean;
	readonly githubSync: GitHubSyncPolicy;
	readonly title: string;
	readonly description: string;
	readonly plaintextInSetup?: boolean;
	readonly canAutoGenerate?: boolean;
};

/** Trimmed `process.env[key]` for Worker plaintext bindings (empty if unset). */
export function readProcessEnvTrimmed(key: string): string {
	return process.env[key]?.trim() ?? "";
}

export function isRequiredInSetupMode(req: EnvRequirement, mode: EnvSetupMode): boolean {
	return req.requiredIn.includes(mode);
}

export function isOptionalInSetupMode(req: EnvRequirement, mode: EnvSetupMode): boolean {
	return (req.optionalSetupModes ?? []).includes(mode);
}

export function isShownInSetup(req: EnvRequirement, mode: EnvSetupMode): boolean {
	if (req.setup === false) {
		return false;
	}
	return isRequiredInSetupMode(req, mode) || isOptionalInSetupMode(req, mode);
}

export function setupRequirementsForMode(
	requirements: readonly EnvRequirement[],
	mode: EnvSetupMode,
): EnvRequirement[] {
	return requirements.filter((r) => isShownInSetup(r, mode));
}

export function setupNavigableKeyOrder(
	mode: EnvSetupMode,
	requirements: readonly EnvRequirement[],
): string[] {
	const shown = setupRequirementsForMode(requirements, mode);
	const required = shown.filter((r) => isRequiredInSetupMode(r, mode));
	const optional = shown.filter(
		(r) => isOptionalInSetupMode(r, mode) && !isRequiredInSetupMode(r, mode),
	);
	return [...required, ...optional].map((r) => r.key);
}

export function requirementByKey(
	requirements: readonly EnvRequirement[],
): ReadonlyMap<string, EnvRequirement> {
	return new Map(requirements.map((r) => [r.key, r]));
}

function valueFromEnv(env: Record<string, string | undefined>, key: string): string | undefined {
	return env[key]?.trim();
}

export function buildGitHubRequiredSecretPayload(
	requirements: readonly EnvRequirement[],
	env: Record<string, string | undefined>,
): { payload: Record<string, string>; missing: string[] } {
	const missing: string[] = [];
	const payload: Record<string, string> = {};
	for (const r of requirements) {
		if (r.kind !== "secret" || r.githubSync !== "required") {
			continue;
		}
		const v = valueFromEnv(env, r.key);
		if (v) {
			payload[r.key] = v;
		} else {
			missing.push(r.key);
		}
	}
	return { payload, missing };
}

export function buildGitHubOptionalSecretPayload(
	requirements: readonly EnvRequirement[],
	env: Record<string, string | undefined>,
): Record<string, string> {
	const payload: Record<string, string> = {};
	for (const r of requirements) {
		if (r.kind !== "secret" || r.githubSync !== "optional") {
			continue;
		}
		const v = valueFromEnv(env, r.key);
		if (v) {
			payload[r.key] = v;
		}
	}
	return payload;
}

export function buildGitHubRequiredVariablePayload(
	requirements: readonly EnvRequirement[],
	env: Record<string, string | undefined>,
): { payload: Record<string, string>; missing: string[] } {
	const missing: string[] = [];
	const payload: Record<string, string> = {};
	for (const r of requirements) {
		if (r.kind !== "variable" || r.githubSync !== "required") {
			continue;
		}
		const v = valueFromEnv(env, r.key);
		if (v) {
			payload[r.key] = v;
		} else {
			missing.push(r.key);
		}
	}
	return { payload, missing };
}

export function buildGitHubOptionalVariablePayload(
	requirements: readonly EnvRequirement[],
	env: Record<string, string | undefined>,
): Record<string, string> {
	const payload: Record<string, string> = {};
	for (const r of requirements) {
		if (r.kind !== "variable" || r.githubSync !== "optional") {
			continue;
		}
		const v = valueFromEnv(env, r.key);
		if (v) {
			payload[r.key] = v;
		}
	}
	return payload;
}

/**
 * Deploy preflight: required GitHub-sync secrets + required GitHub-sync variables (except deploy gate).
 * `ALCHEMY_STATE_TOKEN` is validated only when `requiresAlchemyStateToken` (typically CI).
 */
export function missingDeployConfigurationKeysFromRequirements(
	requirements: readonly EnvRequirement[],
	env: Record<string, string | undefined>,
	options?: { requiresAlchemyStateToken?: boolean },
): string[] {
	const missing: string[] = [];
	for (const r of requirements) {
		if (r.kind !== "secret" || r.githubSync !== "required") {
			continue;
		}
		if (options?.requiresAlchemyStateToken !== true && r.key === "ALCHEMY_STATE_TOKEN") {
			continue;
		}
		if (!valueFromEnv(env, r.key)) {
			missing.push(r.key);
		}
	}
	for (const r of requirements) {
		if (
			r.kind !== "variable" ||
			r.githubSync !== "required" ||
			r.key === "CF_STARTER_DEPLOY_ENABLED"
		) {
			continue;
		}
		if (!valueFromEnv(env, r.key)) {
			missing.push(r.key);
		}
	}
	return missing;
}
