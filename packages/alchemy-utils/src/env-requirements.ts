/**
 * Declarative env requirements for repo-root dotfiles, `setup:*`, and `github:sync:*`.
 * Import these from sidecar modules — not from `alchemy.run.ts` (which has Alchemy side effects).
 */

export type EnvSetupMode = "local" | "staging" | "prod";

/** Leaf row: {@link EnvRequirement.setupCategory} matches {@link EnvSetupCategoryLeaf.id}. */
export type EnvSetupCategoryLeaf = {
	readonly id: string;
	readonly label: string;
	readonly description: string;
};

/** Non-leaf folder in the setup category browser (groups {@link EnvSetupCategoryLeaf} rows). */
export type EnvSetupCategoryNavGroup = {
	readonly id: string;
	readonly label: string;
	readonly description: string;
	readonly children: readonly EnvSetupCategoryLeaf[];
};

/** Top-level entry in {@link ENV_SETUP_CATEGORY_NAV}: either a leaf or a folder. */
export type EnvSetupNavRoot = EnvSetupCategoryLeaf | EnvSetupCategoryNavGroup;

export function isEnvSetupCategoryNavGroup(n: EnvSetupNavRoot): n is EnvSetupCategoryNavGroup {
	return "children" in n;
}

type LeafIdFromNav<R extends EnvSetupNavRoot> = R extends EnvSetupCategoryNavGroup
	? R["children"][number]["id"]
	: R extends EnvSetupCategoryLeaf
		? R["id"]
		: never;

/**
 * Nested `setup:*` category browser — top-level order follows this array; groups expand to submenus.
 * Each {@link EnvRequirement.setupCategory} must match some leaf `id` (see {@link EnvSetupCategoryId}).
 */
export const ENV_SETUP_CATEGORY_NAV = [
	{
		id: "alchemy-chatroom",
		label: "Alchemy & chatroom",
		description:
			"Alchemy password, cloud state token, and the chatroom durable-object internal secret.",
	},
	{
		id: "cloudflare",
		label: "Cloudflare",
		description: "API token and account ID for Workers, D1, and related resources.",
	},
	{
		id: "github-sync-cli",
		label: "GitHub admin CLI",
		description:
			"GITHUB_SYNC_PUSH_SECRETS: omit or blank → default true (upload secrets + Environment variables from this dotfile; needs all required keys). false → config-only sync (repo merge settings, rulesets, environment shells; no secret upload); same as bun run github:sync:config. Rulesets/policy file: config/github.policy.ts. Details: .env.example.",
	},
	{
		id: "custom-domains",
		label: "Custom domains (`WEB_*`)",
		description: "Optional custom hostnames, routes, and zone binding for the web worker.",
	},
	{
		id: "analytics",
		label: "PostHog & analytics",
		description: "Optional PostHog keys and CLI settings for product analytics and source maps.",
	},
] as const satisfies readonly EnvSetupNavRoot[];

/** Leaf category id — inferred from {@link ENV_SETUP_CATEGORY_NAV}. */
export type EnvSetupCategoryId = LeafIdFromNav<(typeof ENV_SETUP_CATEGORY_NAV)[number]>;

function flattenEnvSetupLeafRows(): EnvSetupCategoryLeaf[] {
	const out: EnvSetupCategoryLeaf[] = [];
	for (const root of ENV_SETUP_CATEGORY_NAV) {
		if (isEnvSetupCategoryNavGroup(root)) {
			out.push(...root.children);
		} else {
			out.push(root);
		}
	}
	return out;
}

/** Top-level declaration order of leaf categories (depth-first). */
function setupCategoryLeafIdsInOrder(): EnvSetupCategoryId[] {
	return flattenEnvSetupLeafRows().map((r) => r.id) as EnvSetupCategoryId[];
}

/** Short titles for setup prompts (per leaf id). */
export const ENV_SETUP_CATEGORY_LABEL = Object.fromEntries(
	flattenEnvSetupLeafRows().map((c) => [c.id, c.label] as const),
) as Record<EnvSetupCategoryId, string>;

/** Longer blurbs for tooltips or docs (per leaf id). */
export const ENV_SETUP_CATEGORY_DESCRIPTION = Object.fromEntries(
	flattenEnvSetupLeafRows().map((c) => [c.id, c.description] as const),
) as Record<EnvSetupCategoryId, string>;

/** How a key is mirrored to GitHub Environments by `stacks/admin.ts`. */
export type GitHubSyncPolicy = "required" | "optional" | "never";

export type EnvRequirement = {
	readonly key: string;
	/** Subgroup in **`bun run setup:*`** (drives category submenus). */
	readonly setupCategory: EnvSetupCategoryId;
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

/** `KEY=value` line has a non-whitespace value (same rule as setup scripts). */
export function envFileKeyLooksSet(raw: string, key: string): boolean {
	return new RegExp(`^\\s*${key}\\s*=\\s*\\S`, "m").test(raw);
}

export type SetupCategoryGroup = { category: EnvSetupCategoryId; keys: string[] };

export function setupNavigableKeysByCategory(
	mode: EnvSetupMode,
	requirements: readonly EnvRequirement[],
): SetupCategoryGroup[] {
	const orderedKeys = setupNavigableKeyOrder(mode, requirements);
	const map = requirementByKey(requirements);
	const byCat = new Map<EnvSetupCategoryId, string[]>();
	for (const k of orderedKeys) {
		const req = map.get(k);
		if (!req) {
			continue;
		}
		const cat = req.setupCategory;
		const list = byCat.get(cat);
		if (list) {
			list.push(k);
		} else {
			byCat.set(cat, [k]);
		}
	}
	return setupCategoryLeafIdsInOrder().flatMap((id) => {
		const keys = byCat.get(id);
		return keys?.length ? [{ category: id, keys }] : [];
	});
}

/** True when every key in the category that is **required** for `mode` has a non-empty value in `raw`. */
export function setupCategoryRequiredSatisfied(
	raw: string,
	mode: EnvSetupMode,
	requirements: readonly EnvRequirement[],
	categoryKeys: readonly string[],
): boolean {
	const map = requirementByKey(requirements);
	for (const k of categoryKeys) {
		const req = map.get(k);
		if (!req || !isRequiredInSetupMode(req, mode)) {
			continue;
		}
		if (!envFileKeyLooksSet(raw, k)) {
			return false;
		}
	}
	return true;
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
			r.key === "MULTIWORKER_DEPLOY_ENABLED"
		) {
			continue;
		}
		if (!valueFromEnv(env, r.key)) {
			missing.push(r.key);
		}
	}
	return missing;
}
