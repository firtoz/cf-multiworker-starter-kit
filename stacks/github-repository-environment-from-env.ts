import type {
	GithubEnvironmentDeploymentRules,
	GithubStagingForkDeploymentRules,
} from "../packages/alchemy-utils/src/github-policy-config";
import { getGitHubActorLogin } from "./github-admin-target";

/** Concrete shape for **`RepositoryEnvironment`** (no optional ambiguity from `Pick`). */
export type ExplicitRepositoryEnvironmentProtection = {
	adminBypass: boolean;
	waitTimer: number;
	preventSelfReview: boolean;
	reviewers: { users: string[]; teams: string[] };
	deploymentBranchPolicy: {
		protectedBranches: boolean;
		customBranchPolicies: boolean;
	};
	branchPatterns?: string[];
};

function parseCommaList(raw: readonly string[]): string[] {
	return [...raw];
}

function parseOptionalInt(n: number, label: string): number {
	if (!Number.isFinite(n)) {
		throw new Error(`${label} must be a finite integer (got ${JSON.stringify(n)})`);
	}
	return n;
}

function assertWaitTimerRange(waitTimer: number, label: string): void {
	if (waitTimer < 0 || waitTimer > 43200) {
		throw new Error(`${label} must be between 0 and 43200`);
	}
}

/**
 * Build **`RepositoryEnvironment`** protection from **`config/github.policy.ts`** for **`staging`** or **`production`**.
 */
export function explicitRepositoryEnvironmentProtectionFromRules(
	rules: GithubEnvironmentDeploymentRules,
): ExplicitRepositoryEnvironmentProtection {
	const waitTimer = parseOptionalInt(rules.waitTimerMinutes, "waitTimerMinutes");
	assertWaitTimerRange(waitTimer, "waitTimerMinutes");

	const userReviewers = parseCommaList(rules.reviewerUsers);
	const teamReviewers = parseCommaList(rules.reviewerTeams);
	const branchPatterns = parseCommaList(rules.branchPatterns);

	const deploymentBranchPolicy = {
		protectedBranches: rules.deploymentBranchProtectedOnly,
		customBranchPolicies: branchPatterns.length > 0,
	};

	return {
		adminBypass: true,
		waitTimer,
		preventSelfReview: rules.preventSelfReview,
		reviewers: { users: userReviewers, teams: teamReviewers },
		deploymentBranchPolicy,
		...(branchPatterns.length > 0 ? { branchPatterns } : {}),
	};
}

/**
 * Protection applied to **`staging-fork`** on each **`github:sync:staging`**.
 */
export function stagingForkRepositoryEnvironmentProtectionFromRules(
	rules: GithubStagingForkDeploymentRules,
): ExplicitRepositoryEnvironmentProtection {
	const waitTimer = parseOptionalInt(rules.waitTimerMinutes, "stagingFork.waitTimerMinutes");
	assertWaitTimerRange(waitTimer, "stagingFork.waitTimerMinutes");

	let userReviewers = parseCommaList(rules.reviewerUsers);
	const teamReviewers = parseCommaList(rules.reviewerTeams);
	if (userReviewers.length === 0 && teamReviewers.length === 0 && rules.reviewerFallbackToActor) {
		userReviewers = [getGitHubActorLogin()];
	}

	const branchPatterns = parseCommaList(rules.branchPatterns);

	const deploymentBranchPolicy = {
		protectedBranches: rules.deploymentBranchProtectedOnly,
		customBranchPolicies: branchPatterns.length > 0,
	};

	return {
		adminBypass: true,
		waitTimer,
		preventSelfReview: rules.preventSelfReview,
		reviewers: { users: userReviewers, teams: teamReviewers },
		deploymentBranchPolicy,
		...(branchPatterns.length > 0 ? { branchPatterns } : {}),
	};
}
