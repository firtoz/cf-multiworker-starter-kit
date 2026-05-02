/**
 * Local/admin-only: create or update the GitHub Actions **environment** shell and **deployment protection**
 * (required reviewers, wait timer, branch policy) via Alchemy **`RepositoryEnvironment`** — **no** secrets or variables.
 *
 * Use when you want workflow deployment gates (e.g. PR preview) without touching `.env.staging` / `.env.production`
 * or syncing Cloudflare tokens to GitHub.
 *
 * From repo root (token via `gh auth token` or `GITHUB_TOKEN`; repo via `gh repo view` or `GITHUB_REPOSITORY`):
 * - `bun run github:env:staging`
 * - `bun run github:env:prod`
 *
 * Optional env — same keys as optional overlay on **`github:sync:*`** (see `github-repository-environment-from-env.ts`):
 * - `GITHUB_ENV_DEPLOYMENT_REVIEWER_USERS` — comma-separated GitHub usernames (no `@`)
 * - `GITHUB_ENV_DEPLOYMENT_REVIEWER_TEAMS` — `org/team-slug` or `team-slug` (resolved under repo owner)
 * - `GITHUB_ENV_WAIT_TIMER_MINUTES` — `0`–`43200` (default `0`)
 * - `GITHUB_ENV_PREVENT_SELF_REVIEW` — `true` / `false` (default `false`)
 * - `GITHUB_ENV_DEPLOYMENT_BRANCH_PROTECTED_ONLY` — `true` limits deployments to protected branches only
 * - `GITHUB_ENV_DEPLOYMENT_BRANCH_CUSTOM_PATTERNS` — comma-separated patterns when custom branch policies are desired
 */
import alchemy from "alchemy";
import { RepositoryEnvironment } from "alchemy/github";
import { resolveStageFromEnv } from "../packages/alchemy-utils/deployment-stage";
import { CF_STARTER_APPS } from "../packages/alchemy-utils/worker-peer-scripts";
import {
	getGitHubTarget,
	getGitHubToken,
	githubActionsEnvironmentFromAlchemyStage,
} from "./github-admin-target";
import { repositoryEnvironmentProtectionForEnvOnlyDeploy } from "./github-repository-environment-from-env";

const stageSlug = resolveStageFromEnv();
const githubEnvironment = githubActionsEnvironmentFromAlchemyStage(stageSlug);

const githubToken = getGitHubToken();
const { owner, repository } = getGitHubTarget();

const app = await alchemy(CF_STARTER_APPS.admin, {
	stage: stageSlug,
});

if (githubActionsEnvironmentFromAlchemyStage(app.stage) !== githubEnvironment) {
	throw new Error(
		`stacks/github-environment-only.ts: app.stage "${app.stage}" does not match STAGE for GitHub environment "${githubEnvironment}".`,
	);
}

const protection = repositoryEnvironmentProtectionForEnvOnlyDeploy();

await RepositoryEnvironment("github-actions-environment", {
	owner,
	repository,
	name: githubEnvironment,
	token: githubToken,
	...(protection.waitTimer !== undefined ? { waitTimer: protection.waitTimer } : {}),
	...(protection.preventSelfReview !== undefined ? { preventSelfReview: protection.preventSelfReview } : {}),
	...(protection.reviewers ? { reviewers: protection.reviewers } : {}),
	...(protection.deploymentBranchPolicy ? { deploymentBranchPolicy: protection.deploymentBranchPolicy } : {}),
	...(protection.branchPatterns ? { branchPatterns: protection.branchPatterns } : {}),
	adminBypass: protection.adminBypass,
});

console.log({
	app: CF_STARTER_APPS.admin,
	alchemyStage: app.stage,
	repository: `${owner}/${repository}`,
	environment: githubEnvironment,
	...protection,
});

await app.finalize();
