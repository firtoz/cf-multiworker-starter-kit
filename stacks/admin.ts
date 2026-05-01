/**
 * Local/admin-only: sync GitHub Actions **environment** secrets and **variables** from a stage dotfile.
 *
 * - **Production:** `STAGE=prod`, repo-root `.env.production`, GitHub environment **`production`**.
 * - **Staging:** `STAGE=staging`, repo-root `.env.staging`, GitHub environment **`staging`**.
 *
 * **Secrets** (GitHubSecret): `ALCHEMY_PASSWORD`, `ALCHEMY_STATE_TOKEN`, `CHATROOM_INTERNAL_SECRET`, `CLOUDFLARE_API_TOKEN`
 * **Variables** (REST): `CLOUDFLARE_ACCOUNT_ID`, `CF_STARTER_DEPLOY_ENABLED=true`, and optional plaintext **`WEB_*`** keys (`WEB_DOMAINS`, `WEB_ROUTES`, `WEB_ZONE_ID`, `WEB_DOMAIN_OVERRIDE_EXISTING_ORIGIN`) when set in the dotfile — **`GitHubEnvironmentVariable`** resources in **`github-environment-variable.ts`** (shared list prefetch per env/token in-process + one tracked resource per name).
 *
 * Run from repo root:
 * - `bun run github:sync:prod`
 * - `bun run github:sync:staging`
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
import { GitHubEnvironmentVariable } from "./github-environment-variable";

const REPO_ROOT = path.resolve(import.meta.dir, "..");

function runGh(args: readonly string[], hint: string) {
	const proc = Bun.spawnSync(["gh", ...args], {
		stderr: "pipe",
		stdout: "pipe",
	});
	if (!proc.success) {
		const stderr = proc.stderr.toString().trim();
		throw new Error(`${hint}${stderr ? `\n\nGitHub CLI said:\n${stderr}` : ""}`);
	}
	const value = proc.stdout.toString().trim();
	if (!value) {
		throw new Error(hint);
	}
	return value;
}

function optionalEnv(name: string) {
	const value = process.env[name]?.trim();
	return value ? value : undefined;
}

function parseGitHubRepository(value: string) {
	const [owner, repository] = value.split("/");
	if (!owner || !repository || value.split("/").length !== 2) {
		throw new Error(`${value} is not a valid GITHUB_REPOSITORY value. Expected owner/repo.`);
	}
	return { owner, repository };
}

function getGitHubTarget() {
	const owner = optionalEnv("GITHUB_OWNER");
	const repository = optionalEnv("GITHUB_REPOSITORY_NAME");
	if (owner && repository) {
		return { owner, repository };
	}

	const githubRepository =
		optionalEnv("GITHUB_REPOSITORY") ??
		runGh(
			["repo", "view", "--json", "owner,name", "--jq", '.owner.login + "/" + .name'],
			"Could not infer the GitHub repository. Run `gh auth login` from the repo checkout, or set GITHUB_REPOSITORY=owner/repo.",
		);
	return parseGitHubRepository(githubRepository);
}

function getGitHubToken() {
	return (
		optionalEnv("GITHUB_TOKEN") ??
		runGh(
			["auth", "token"],
			"Could not read a GitHub token. Run `gh auth login` and, if needed, `gh auth refresh -s repo`; or set GITHUB_TOKEN.",
		)
	);
}

function githubActionsEnvironmentFromAlchemyStage(stage: string): "production" | "staging" {
	const s = stage.trim().toLowerCase();
	if (s === "prod" || s === "production") {
		return "production";
	}
	if (s === "staging") {
		return "staging";
	}
	throw new Error(
		`stacks/admin.ts: STAGE must be "prod" or "staging" for GitHub sync (got ${JSON.stringify(stage)}). PR preview stages use the staging environment automatically in CI — do not run this stack for pr-*.`,
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

const stageSlug = resolveStageFromEnv();
const githubEnvironment = githubActionsEnvironmentFromAlchemyStage(stageSlug);
const ENV_DOTFILE_PATH = dotfilePathForGithubEnvironment(githubEnvironment);
const ENV_DOTFILE_REL = path.relative(REPO_ROOT, ENV_DOTFILE_PATH) || ENV_DOTFILE_PATH;

const setupCli = setupCommandLabelForDotfileRel(ENV_DOTFILE_REL);
const hintForMissing = `Run \`${setupCli}\` (or \`bun run github:setup\`) to prepare ${ENV_DOTFILE_REL}, then rerun the matching \`bun run github:sync:*\` command.`;

const envFromDotfile = loadStageDotfileOrThrow(ENV_DOTFILE_PATH, hintForMissing);

const { payload: secretPayload, missing: missingSecrets } =
	buildGitHubSecretPayload(envFromDotfile);
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

const { payload: varPart, missing: missingVars } =
	buildGitHubVariablePayloadFromDotfile(envFromDotfile);
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

const githubVariables: Record<string, string> = {
	...varPart,
	[CF_STARTER_DEPLOY_ENABLED_VAR]: varPart[CF_STARTER_DEPLOY_ENABLED_VAR] ?? "true",
};

const githubToken = getGitHubToken();
const { owner, repository } = getGitHubTarget();

const app = await alchemy(CF_STARTER_APPS.admin, {
	stage: stageSlug,
});

if (githubActionsEnvironmentFromAlchemyStage(app.stage) !== githubEnvironment) {
	throw new Error(
		`stacks/admin.ts: Alchemy app.stage "${app.stage}" does not match ${ENV_DOTFILE_REL} for GitHub environment "${githubEnvironment}".`,
	);
}

await RepositoryEnvironment("github-actions-environment", {
	owner,
	repository,
	name: githubEnvironment,
});

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
	envFile: ENV_DOTFILE_PATH,
	repository: `${owner}/${repository}`,
	environment: githubEnvironment,
	secrets: Object.keys(secretPayload).sort(),
	variables: variableNames,
});

await app.finalize();
