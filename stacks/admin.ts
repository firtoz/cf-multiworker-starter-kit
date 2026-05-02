/**
 * Local/admin-only: GitHub Actions **environment** + optional **secrets** / **variables** sync.
 *
 * **`GITHUB_SYNC_SCOPE`** (required):
 * - **`secrets`** — read repo-root `.env.production` or `.env.staging`, upsert **`RepositoryEnvironment`**, then
 *   **GitHubSecret** + **GitHubEnvironmentVariable** for that environment.
 * - **`environment`** — **only** create/update **`RepositoryEnvironment`** (deployment protection). **No** dotfile,
 *   **no** secrets, **no** variables. Requires **`GITHUB_SYNC_ENVIRONMENT_ONLY_CONFIRM=true`**.
 *
 * Deployment protection (`GITHUB_ENV_*`) is applied **only** when:
 * - `GITHUB_SYNC_SCOPE=environment` (always — all **`GITHUB_ENV_*`** keys required), or
 * - `GITHUB_SYNC_SCOPE=secrets` **and** `GITHUB_SYNC_UPDATE_ENVIRONMENT_PROTECTION=true` (same **`GITHUB_ENV_*`**).
 *
 * For **`GITHUB_ENV_*`** every listed variable must be set (use `""` for “none”); see **`github-repository-environment-from-env.ts`**.
 *
 * Run from repo root:
 * - `bun run github:sync:prod` / `github:sync:staging` — scope **`secrets`** + stage dotfile
 * - `bun run github:env:prod` / `github:env:staging` — scope **`environment`** + confirm (no `-e` dotfile)
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import alchemy from "alchemy";
import { GitHubSecret, RepositoryEnvironment } from "alchemy/github";
import { parse } from "dotenv";
import { resolveStageFromEnv } from "../packages/alchemy-utils/deployment-stage";
import { CF_STARTER_APPS } from "../packages/alchemy-utils/worker-peer-scripts";
import {
	buildGitHubSecretPayload,
	buildGitHubVariablePayloadFromDotfile,
	CF_STARTER_DEPLOY_ENABLED_VAR,
	setupCommandLabelForDotfileRel,
} from "../packages/scripts/github-environment-secrets";
import {
	getGitHubTarget,
	getGitHubToken,
	githubActionsEnvironmentFromAlchemyStage,
} from "./github-admin-target";
import { parseExplicitRepositoryEnvironmentProtectionFromEnv } from "./github-repository-environment-from-env";
import { GitHubEnvironmentVariable } from "./github-environment-variable";

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
			`- "environment": update GitHub Environment config only (no dotfile; set GITHUB_SYNC_ENVIRONMENT_ONLY_CONFIRM=true).`,
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
			process.env[k] = v;
			envFromDotfile[k] = v;
		}
	}
	return envFromDotfile;
}

const scope = parseGithubSyncScope();
const stageSlug = resolveStageFromEnv();
const githubEnvironment = githubActionsEnvironmentFromAlchemyStage(stageSlug);
const ENV_DOTFILE_PATH = dotfilePathForGithubEnvironment(githubEnvironment);
const ENV_DOTFILE_REL = path.relative(REPO_ROOT, ENV_DOTFILE_PATH) || ENV_DOTFILE_PATH;

const setupCli = setupCommandLabelForDotfileRel(ENV_DOTFILE_REL);
const hintForMissing = `Run \`${setupCli}\` (or \`bun run github:setup\`) to prepare ${ENV_DOTFILE_REL}, then rerun the matching \`bun run github:sync:*\` command.`;

let secretPayload: Record<string, string> = {};
let githubVariables: Record<string, string> = {};

if (scope === "secrets") {
	const envFromDotfile = loadStageDotfileOrThrow(ENV_DOTFILE_PATH, hintForMissing);

	const { payload: secrets, missing: missingSecrets } = buildGitHubSecretPayload(envFromDotfile);
	if (missingSecrets.length > 0) {
		throw new Error(
			[
				`Missing non-empty GitHub **secret** keys in ${ENV_DOTFILE_REL} for environment "${githubEnvironment}":`,
				...missingSecrets.map((k) => `  - ${k}`),
				"",
				`Fix: ${hintForMissing}`,
			].join("\n"),
		);
	}
	secretPayload = secrets;

	const { payload: varPart, missing: missingVars } = buildGitHubVariablePayloadFromDotfile(envFromDotfile);
	if (missingVars.length > 0) {
		throw new Error(
			[
				`Missing non-empty GitHub **variable** keys in ${ENV_DOTFILE_REL} for environment "${githubEnvironment}":`,
				...missingVars.map((k) => `  - ${k}`),
				"",
				`Fix: ${hintForMissing}`,
			].join("\n"),
		);
	}
	githubVariables = {
		...varPart,
		[CF_STARTER_DEPLOY_ENABLED_VAR]: varPart[CF_STARTER_DEPLOY_ENABLED_VAR] ?? "true",
	};
} else {
	const confirm = process.env["GITHUB_SYNC_ENVIRONMENT_ONLY_CONFIRM"]?.trim();
	if (confirm !== "true") {
		throw new Error(
			[
				`GITHUB_SYNC_SCOPE=environment refuses to run without an explicit confirmation.`,
				`Set GITHUB_SYNC_ENVIRONMENT_ONLY_CONFIRM=true (exactly).`,
				`This mode does not read .env.staging / .env.production and does not sync secrets or variables.`,
			].join(" "),
		);
	}
}

const githubToken = getGitHubToken();
const { owner, repository } = getGitHubTarget();

const app = await alchemy(CF_STARTER_APPS.admin, {
	stage: stageSlug,
});

if (githubActionsEnvironmentFromAlchemyStage(app.stage) !== githubEnvironment) {
	throw new Error(
		`stacks/admin.ts: Alchemy app.stage "${app.stage}" does not match GitHub environment "${githubEnvironment}" for STAGE=${JSON.stringify(stageSlug)}.`,
	);
}

const updateProtectionOnSecretsSync =
	scope === "secrets" && process.env["GITHUB_SYNC_UPDATE_ENVIRONMENT_PROTECTION"]?.trim() === "true";

if (scope === "environment" || updateProtectionOnSecretsSync) {
	const protection = parseExplicitRepositoryEnvironmentProtectionFromEnv();
	await RepositoryEnvironment("github-actions-environment", {
		owner,
		repository,
		name: githubEnvironment,
		token: githubToken,
		waitTimer: protection.waitTimer,
		preventSelfReview: protection.preventSelfReview,
		adminBypass: protection.adminBypass,
		reviewers: protection.reviewers,
		deploymentBranchPolicy: protection.deploymentBranchPolicy,
		...(protection.branchPatterns && protection.branchPatterns.length > 0
			? { branchPatterns: protection.branchPatterns }
			: {}),
	});
} else {
	await RepositoryEnvironment("github-actions-environment", {
		owner,
		repository,
		name: githubEnvironment,
		token: githubToken,
	});
}

if (scope === "secrets") {
	for (const name of Object.keys(secretPayload) as (keyof typeof secretPayload)[]) {
		const raw = secretPayload[name]?.trim();
		if (!raw) {
			throw new Error(`Unexpected: secret ${name} missing after validation.`);
		}
		await GitHubSecret(`github-env-${name}`, {
			owner,
			repository,
			name,
			environment: githubEnvironment,
			value: alchemy.secret(raw),
			token: alchemy.secret(githubToken),
		});
	}

	const variableNames = Object.keys(githubVariables).sort();
	for (const name of variableNames) {
		const value = githubVariables[name];
		if (value === undefined) {
			continue;
		}
		await GitHubEnvironmentVariable(`github-env-variable-${name}`, {
			owner,
			repository,
			environment: githubEnvironment,
			name,
			value,
			token: githubToken,
		});
	}

	console.log({
		app: CF_STARTER_APPS.admin,
		alchemyStage: app.stage,
		GITHUB_SYNC_SCOPE: scope,
		GITHUB_SYNC_UPDATE_ENVIRONMENT_PROTECTION: updateProtectionOnSecretsSync,
		envFile: ENV_DOTFILE_PATH,
		repository: `${owner}/${repository}`,
		environment: githubEnvironment,
		secrets: Object.keys(secretPayload).sort(),
		variables: variableNames,
	});
} else {
	console.log({
		app: CF_STARTER_APPS.admin,
		alchemyStage: app.stage,
		GITHUB_SYNC_SCOPE: scope,
		repository: `${owner}/${repository}`,
		environment: githubEnvironment,
		message: "RepositoryEnvironment only — no secrets or variables synced.",
	});
}

await app.finalize();
