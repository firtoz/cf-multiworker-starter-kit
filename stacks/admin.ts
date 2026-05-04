/**
 * Local/admin-only: GitHub Actions **environment** + optional **secrets** / **variables** sync.
 *
 * **`GITHUB_SYNC_SCOPE`** (required — no default; **`package.json`** scripts set it):
 * - **`secrets`** — optionally push GitHub **secrets** / Environment **variables** (see **`GITHUB_SYNC_PUSH_SECRETS`**).
 *   When **`GITHUB_SYNC_PUSH_SECRETS`** is not **`false`**, requires a complete stage dotfile. Otherwise merges an
 *   **optional** dotfile (if present), updates **RepositoryEnvironment** shells, and runs other non-secret steps without
 *   requiring **`ALCHEMY_PASSWORD`** etc.
 * - **`environment`** — **only** create/update **`RepositoryEnvironment`** (deployment protection from
 *   **`config/github.policy.ts`**). Merges the stage dotfile **when present** for secrets / vars only if you still use
 *   one; **no** GitHub **secrets** or **Environment variables** are written by this scope.
 *
 * **`GITHUB_SYNC_PUSH_SECRETS`** (only when **`scope=secrets`**):
 * - **Unset, empty, or whitespace** → **`true`** (push secrets + variables).
 * - **`true`** / **`1`** / **`yes`** / **`on`** (case-insensitive) → **`true`**.
 * - **`false`** / **`0`** / **`no`** / **`off`** (case-insensitive) → **`false`** (config-only; other strings throw).
 *
 * **`GITHUB_SYNC_UPDATE_ENVIRONMENT_PROTECTION`** (only when **`scope=secrets`**):
 * - **Only** trimmed **`true`** applies **`RepositoryEnvironment`** protection from **`config/github.policy.ts`** during
 *   the sync. **Unset**, **empty**, or anything else → **false** (this run only creates minimal **RepositoryEnvironment**
 *   shells for **`staging`** / **`production`**; **`staging-fork`** still gets full fork protection from policy whenever
 *   **`scope=secrets`**).
 *
 * **Deployment protection** is applied when:
 * - `GITHUB_SYNC_SCOPE=environment`, or
 * - `GITHUB_SYNC_SCOPE=secrets` **and** `GITHUB_SYNC_UPDATE_ENVIRONMENT_PROTECTION=true`.
 *
 * **Staging secrets** (`STAGE=staging`, scope **`secrets`**) also mirror to **`staging-fork`** for legacy/future
 * preview workflows and apply protection from **`config/github.policy.ts`** → **`github.environments.stagingFork`**.
 *
 * **`GITHUB_SYNC_STAGING_FORK_REVIEWERS_PRIVATE`** (optional, staging **`staging-fork`** only): when **`reviewerFallbackToActor`** is **`"auto"`** and the repo is **private**, set **`1`** / **`true`** / **`yes`** / **`on`** so sync injects the **`gh`** actor as required reviewer (plans that support Environment reviewers). **Public** and **internal** repos enable actor fallback automatically under **`"auto"`**.
 *
 * **Repository REST + rulesets** (staging sync only, scope **`secrets`**): driven by **`config/github.policy.ts`** →
 * **`github.sync`** / **`github.repository`** — see **`stacks/github-repository-settings-sync.ts`** and
 * **`stacks/github-repo-rulesets-sync.ts`**.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Octokit } from "@octokit/rest";
import alchemy from "alchemy";
import { GitHubSecret, RepositoryEnvironment } from "alchemy/github";
import { parse } from "dotenv";
import githubPolicy from "../config/github.policy";
import {
	isCloudflareAlchemyAccountEnvKey,
	mergeCloudflareAlchemyAccountEnvInto,
} from "../packages/alchemy-utils/src/cloudflare-account-env";
import { resolveStageFromEnv } from "../packages/alchemy-utils/src/deployment-stage";
import {
	assertGithubPolicyConfig,
	type GithubRepoVisibility,
	resolveStagingForkReviewerFallbackToActor,
	shouldApplyGithubRulesets,
} from "../packages/alchemy-utils/src/github-policy-config";
import { ALCHEMY_APP_IDS } from "../packages/alchemy-utils/src/worker-peer-scripts";
import {
	buildGitHubSecretPayload,
	buildGitHubVariablePayloadFromDotfile,
	DEPLOY_ENABLED_VAR,
	setupCommandLabelForDotfileRel,
} from "../packages/scripts/src/github-environment-secrets";
import { PR_PREVIEW_FORK_GITHUB_ENVIRONMENT } from "../packages/scripts/src/github-pr-preview-fork-policy";
import {
	getGitHubTarget,
	getGitHubToken,
	githubActionsEnvironmentFromAlchemyStage,
} from "./github-admin-target";
import { GitHubEnvironmentVariable } from "./github-environment-variable";
import { octokitHttpErrorDetails } from "./github-http-error";
import { applyGitHubRepoRulesets } from "./github-repo-rulesets-sync";
import {
	type ExplicitRepositoryEnvironmentProtection,
	explicitRepositoryEnvironmentProtectionFromRules,
	stagingForkRepositoryEnvironmentProtectionFromRules,
} from "./github-repository-environment-from-env";
import { applyGitHubRepositoryPolicy } from "./github-repository-settings-sync";

assertGithubPolicyConfig(githubPolicy);

const REPO_ROOT = path.resolve(import.meta.dir, "..");

type GithubSyncScope = "secrets" | "environment";

function parseGithubSyncScope(): GithubSyncScope {
	const raw = process.env["GITHUB_SYNC_SCOPE"]?.trim();
	if (raw === "secrets") {
		return "secrets";
	}
	if (raw === "environment") {
		return "environment";
	}
	throw new Error(
		[
			`Invalid or missing GITHUB_SYNC_SCOPE (got ${JSON.stringify(raw ?? "")}).`,
			`Set exactly one of: "secrets" | "environment".`,
			`- "secrets": sync from .env.staging / .env.production (requires dotfile + secret/variable keys).`,
			`- "environment": update GitHub Environment deployment protection only (from config/github.policy.ts; merges stage dotfile if present for other local env; does not sync secrets or variables).`,
		].join(" "),
	);
}

function dotfilePathForGithubEnvironment(environmentName: "production" | "staging"): string {
	if (environmentName === "staging") {
		return path.join(REPO_ROOT, ".env.staging");
	}
	return path.join(REPO_ROOT, ".env.production");
}

function loadStageDotfileOrThrow(resolvedPath: string, hintCli: string) {
	if (!existsSync(resolvedPath)) {
		throw new Error(`Missing ${resolvedPath}. ${hintCli}`);
	}
	const parsed = parse(readFileSync(resolvedPath, "utf8"));
	const envFromDotfile: Record<string, string | undefined> = {};
	for (const [k, v] of Object.entries(parsed)) {
		if (typeof v === "string") {
			if (isCloudflareAlchemyAccountEnvKey(k)) {
				continue;
			}
			process.env[k] = v;
			envFromDotfile[k] = v;
		}
	}
	return mergeCloudflareAlchemyAccountEnvInto(envFromDotfile);
}

function mergeRepoRootDotfileIntoProcessEnv(resolvedPath: string): void {
	const parsed = parse(readFileSync(resolvedPath, "utf8"));
	for (const [k, v] of Object.entries(parsed)) {
		if (typeof v === "string") {
			if (isCloudflareAlchemyAccountEnvKey(k)) {
				continue;
			}
			process.env[k] = v;
		}
	}
}

function parsePushSecretsDefaultTrue(): boolean {
	const raw = process.env["GITHUB_SYNC_PUSH_SECRETS"]?.trim();
	if (raw === undefined || raw === "") {
		return true;
	}
	const t = raw.toLowerCase();
	if (t === "1" || t === "true" || t === "yes" || t === "on") {
		return true;
	}
	if (t === "0" || t === "false" || t === "no" || t === "off") {
		return false;
	}
	throw new Error(
		`GITHUB_SYNC_PUSH_SECRETS must be "true" or "false" (got ${JSON.stringify(raw)})`,
	);
}

/** Opt-in: **`stagingFork.reviewerFallbackToActor: "auto"`** + **private** repo → still inject actor reviewer (Team+ etc.). */
function parseStagingForkReviewersPrivateEnv(): boolean {
	const raw = process.env["GITHUB_SYNC_STAGING_FORK_REVIEWERS_PRIVATE"]?.trim();
	if (raw === undefined || raw === "") {
		return false;
	}
	const t = raw.toLowerCase();
	if (t === "1" || t === "true" || t === "yes" || t === "on") {
		return true;
	}
	if (t === "0" || t === "false" || t === "no" || t === "off") {
		return false;
	}
	throw new Error(
		`GITHUB_SYNC_STAGING_FORK_REVIEWERS_PRIVATE must be "true" or "false" (got ${JSON.stringify(raw)})`,
	);
}

const scope = parseGithubSyncScope();
const stageSlug = resolveStageFromEnv();
const githubEnvironment = githubActionsEnvironmentFromAlchemyStage(stageSlug);
const ENV_DOTFILE_PATH = dotfilePathForGithubEnvironment(githubEnvironment);
const ENV_DOTFILE_REL = path.relative(REPO_ROOT, ENV_DOTFILE_PATH) || ENV_DOTFILE_PATH;

const setupCli = setupCommandLabelForDotfileRel(ENV_DOTFILE_REL);
const hintForMissing = `Run \`bun run setup:account\` (shared Cloudflare + ALCHEMY_STATE_TOKEN), \`${setupCli}\` for stage-only secrets, and \`bun run github:setup\` as needed; rerun the matching \`bun run github:sync:*\`.`;

/** GitHub Environment names that receive secrets/variables from this run (`staging-fork` mirrors `staging` for legacy/future preview workflows). */
function githubEnvironmentsForSecretSync(): readonly string[] {
	if (scope === "secrets" && githubEnvironment === "staging") {
		return ["staging", PR_PREVIEW_FORK_GITHUB_ENVIRONMENT];
	}
	return [githubEnvironment];
}

let secretPayload: Record<string, string> = {};
let githubVariables: Record<string, string> = {};

const pushSecrets = scope === "secrets" ? parsePushSecretsDefaultTrue() : false;

if (scope === "secrets") {
	if (pushSecrets) {
		const envFromDotfile = loadStageDotfileOrThrow(ENV_DOTFILE_PATH, hintForMissing);

		const { payload: secrets, missing: missingSecrets } = buildGitHubSecretPayload(envFromDotfile);
		if (missingSecrets.length > 0) {
			throw new Error(
				[
					`Missing non-empty GitHub **secret** values for environment "${githubEnvironment}" (stage dotfile **+** machine **account.env** for **CLOUDFLARE_API_TOKEN** / **ALCHEMY_STATE_TOKEN** — run **bun run setup:account**):`,
					...missingSecrets.map((k) => `  - ${k}`),
					"",
					`Fix: ${hintForMissing}`,
				].join("\n"),
			);
		}
		secretPayload = secrets;

		const { payload: varPart, missing: missingVars } =
			buildGitHubVariablePayloadFromDotfile(envFromDotfile);
		if (missingVars.length > 0) {
			throw new Error(
				[
					`Missing non-empty GitHub **variable** values for environment "${githubEnvironment}" (stage dotfile + **account.env** for **CLOUDFLARE_ACCOUNT_ID**):`,
					...missingVars.map((k) => `  - ${k}`),
					"",
					`Fix: ${hintForMissing}`,
				].join("\n"),
			);
		}
		githubVariables = {
			...varPart,
			[DEPLOY_ENABLED_VAR]: varPart[DEPLOY_ENABLED_VAR] ?? "true",
		};
	} else if (existsSync(ENV_DOTFILE_PATH)) {
		mergeRepoRootDotfileIntoProcessEnv(ENV_DOTFILE_PATH);
	}
} else {
	if (existsSync(ENV_DOTFILE_PATH)) {
		mergeRepoRootDotfileIntoProcessEnv(ENV_DOTFILE_PATH);
	}
}

const githubToken = getGitHubToken();
const { owner, repository } = getGitHubTarget();

if (scope === "secrets" && githubEnvironment === "staging") {
	await applyGitHubRepositoryPolicy({
		policy: githubPolicy,
		owner,
		repository,
		token: githubToken,
	});
}

if (
	scope === "secrets" &&
	githubEnvironment === "staging" &&
	shouldApplyGithubRulesets(githubPolicy)
) {
	await applyGitHubRepoRulesets({ policy: githubPolicy, owner, repository, token: githubToken });
}

const app = await alchemy(ALCHEMY_APP_IDS.admin, {
	stage: stageSlug,
});

if (githubActionsEnvironmentFromAlchemyStage(app.stage) !== githubEnvironment) {
	throw new Error(
		`stacks/admin.ts: Alchemy app.stage "${app.stage}" does not match GitHub environment "${githubEnvironment}" for STAGE=${JSON.stringify(stageSlug)}.`,
	);
}

const updateProtectionOnSecretsSync =
	scope === "secrets" &&
	process.env["GITHUB_SYNC_UPDATE_ENVIRONMENT_PROTECTION"]?.trim() === "true";

const syncTargets = githubEnvironmentsForSecretSync();

function repositoryEnvironmentAlchemyId(envName: string): string {
	if (envName === PR_PREVIEW_FORK_GITHUB_ENVIRONMENT) {
		return "github-actions-environment-staging-fork";
	}
	return "github-actions-environment";
}

/** Stable ids for `staging` so existing admin state keeps working; prefixed ids for `staging-fork`. */
function secretAlchemyId(envTarget: string, secretName: string): string {
	if (envTarget === "staging") {
		return `github-env-${secretName}`;
	}
	return `github-env-${envTarget}-${secretName}`;
}

function variableAlchemyId(envTarget: string, variableName: string): string {
	if (envTarget === "staging") {
		return `github-env-variable-${variableName}`;
	}
	return `github-env-variable-${envTarget}-${variableName}`;
}

function repositoryEnvironmentPayload(protection: ExplicitRepositoryEnvironmentProtection) {
	const hasReviewers =
		protection.reviewers.users.length > 0 || protection.reviewers.teams.length > 0;
	return {
		// GitHub rejects environments that enable the wait-timer rule on private repos below Team/Pro;
		// sending wait_timer: 0 still counts as using that rule. Omit entirely when unused (> 0 only).
		...(protection.waitTimer > 0 ? { waitTimer: protection.waitTimer } : {}),
		// Omit prevent_self_review when false — some plans/API paths reject false without reviewers.
		...(protection.preventSelfReview && hasReviewers ? { preventSelfReview: true } : {}),
		adminBypass: protection.adminBypass,
		reviewers: protection.reviewers,
		...(protection.deploymentBranchPolicy
			? { deploymentBranchPolicy: protection.deploymentBranchPolicy }
			: {}),
		...(protection.branchPatterns && protection.branchPatterns.length > 0
			? { branchPatterns: protection.branchPatterns }
			: {}),
	};
}

async function syncRepositoryEnvironmentBestEffort(
	repositoryFullName: string,
	environmentName: string,
	run: () => Promise<void>,
): Promise<void> {
	try {
		await run();
	} catch (error: unknown) {
		const { httpStatus, message } = octokitHttpErrorDetails(error);
		console.warn("[admin] GitHub Environment protection skipped — continuing sync.", {
			githubRepositoryEnvironmentSkipped: true as const,
			repository: repositoryFullName,
			environment: environmentName,
			...(httpStatus === undefined ? {} : { httpStatus }),
			message,
		});
	}
}

async function upsertStagingForkRepositoryEnvironment(): Promise<void> {
	const repoFullName = `${owner}/${repository}`;
	await syncRepositoryEnvironmentBestEffort(
		repoFullName,
		PR_PREVIEW_FORK_GITHUB_ENVIRONMENT,
		async () => {
			const octokit = new Octokit({ auth: githubToken });
			const { data: repoMeta } = await octokit.rest.repos.get({ owner, repo: repository });
			const visibility: GithubRepoVisibility =
				repoMeta.visibility === "internal"
					? "internal"
					: repoMeta.visibility === "public"
						? "public"
						: repoMeta.private
							? "private"
							: "public";

			const effectiveFallback = resolveStagingForkReviewerFallbackToActor(
				githubPolicy.github.environments.stagingFork,
				{ visibility },
				{ forceReviewerFallbackOnPrivateRepo: parseStagingForkReviewersPrivateEnv() },
			);

			const protection = stagingForkRepositoryEnvironmentProtectionFromRules(
				githubPolicy.github.environments.stagingFork,
				effectiveFallback,
			);

			await RepositoryEnvironment(
				repositoryEnvironmentAlchemyId(PR_PREVIEW_FORK_GITHUB_ENVIRONMENT),
				{
					owner,
					repository,
					name: PR_PREVIEW_FORK_GITHUB_ENVIRONMENT,
					token: githubToken,
					...repositoryEnvironmentPayload(protection),
				},
			);
		},
	);
}

if (scope === "environment" || updateProtectionOnSecretsSync) {
	const protection =
		githubEnvironment === "staging"
			? explicitRepositoryEnvironmentProtectionFromRules(githubPolicy.github.environments.staging)
			: explicitRepositoryEnvironmentProtectionFromRules(
					githubPolicy.github.environments.production,
				);
	const repoFullName = `${owner}/${repository}`;
	await syncRepositoryEnvironmentBestEffort(repoFullName, githubEnvironment, async () => {
		await RepositoryEnvironment(repositoryEnvironmentAlchemyId(githubEnvironment), {
			owner,
			repository,
			name: githubEnvironment,
			token: githubToken,
			...repositoryEnvironmentPayload(protection),
		});
	});
	if (scope === "secrets" && githubEnvironment === "staging") {
		await upsertStagingForkRepositoryEnvironment();
	}
} else if (scope === "secrets") {
	for (const envName of syncTargets) {
		if (envName === PR_PREVIEW_FORK_GITHUB_ENVIRONMENT) {
			await upsertStagingForkRepositoryEnvironment();
		} else {
			await RepositoryEnvironment(repositoryEnvironmentAlchemyId(envName), {
				owner,
				repository,
				name: envName,
				token: githubToken,
			});
		}
	}
}

if (scope === "secrets" && pushSecrets) {
	for (const envTarget of syncTargets) {
		for (const name of Object.keys(secretPayload) as (keyof typeof secretPayload)[]) {
			const raw = secretPayload[name]?.trim();
			if (!raw) {
				throw new Error(`Unexpected: secret ${name} missing after validation.`);
			}
			await GitHubSecret(secretAlchemyId(envTarget, name), {
				owner,
				repository,
				name,
				environment: envTarget,
				value: alchemy.secret(raw),
				token: alchemy.secret(githubToken),
			});
		}

		const variableNames = Object.keys(githubVariables).sort();
		for (const varName of variableNames) {
			const value = githubVariables[varName];
			if (value === undefined) {
				continue;
			}
			await GitHubEnvironmentVariable(variableAlchemyId(envTarget, varName), {
				owner,
				repository,
				environment: envTarget,
				name: varName,
				value,
				token: githubToken,
			});
		}
	}

	console.log({
		app: ALCHEMY_APP_IDS.admin,
		alchemyStage: app.stage,
		GITHUB_SYNC_SCOPE: scope,
		GITHUB_SYNC_PUSH_SECRETS: pushSecrets,
		GITHUB_SYNC_UPDATE_ENVIRONMENT_PROTECTION: updateProtectionOnSecretsSync,
		envFile: existsSync(ENV_DOTFILE_PATH) ? ENV_DOTFILE_PATH : null,
		repository: `${owner}/${repository}`,
		githubEnvironments: syncTargets,
		secrets: pushSecrets ? Object.keys(secretPayload).sort() : [],
		variables: pushSecrets ? Object.keys(githubVariables).sort() : [],
	});
} else {
	console.log({
		app: ALCHEMY_APP_IDS.admin,
		alchemyStage: app.stage,
		GITHUB_SYNC_SCOPE: scope,
		envFile: ENV_DOTFILE_PATH,
		repository: `${owner}/${repository}`,
		environment: githubEnvironment,
		message: "RepositoryEnvironment only — no secrets or variables synced.",
	});
}

await app.finalize();
