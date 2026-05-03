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
	deploymentBranchPolicy?: {
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

function deploymentBranchPolicyFor(
	protectedBranches: boolean,
	branchPatterns: readonly string[],
	label: string,
): ExplicitRepositoryEnvironmentProtection["deploymentBranchPolicy"] {
	if (protectedBranches && branchPatterns.length > 0) {
		throw new Error(
			`${label} cannot set deploymentBranchProtectedOnly and branchPatterns at the same time.`,
		);
	}
	if (protectedBranches) {
		return {
			protectedBranches: true,
			customBranchPolicies: false,
		};
	}
	if (branchPatterns.length > 0) {
		return {
			protectedBranches: false,
			customBranchPolicies: true,
		};
	}
	return undefined;
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

	const deploymentBranchPolicy = deploymentBranchPolicyFor(
		rules.deploymentBranchProtectedOnly,
		branchPatterns,
		"deployment environment",
	);

	return {
		adminBypass: true,
		waitTimer,
		preventSelfReview: rules.preventSelfReview,
		reviewers: { users: userReviewers, teams: teamReviewers },
		...(deploymentBranchPolicy ? { deploymentBranchPolicy } : {}),
		...(branchPatterns.length > 0 ? { branchPatterns } : {}),
	};
}

/**
 * Protection applied to **`staging-fork`** on each **`github:sync:staging`**.
 *
 * @param reviewerFallbackEffective — from **`resolveStagingForkReviewerFallbackToActor`** when policy uses **`"auto"`**.
 */
export function stagingForkRepositoryEnvironmentProtectionFromRules(
	rules: GithubStagingForkDeploymentRules,
	reviewerFallbackEffective: boolean,
): ExplicitRepositoryEnvironmentProtection {
	const waitTimer = parseOptionalInt(rules.waitTimerMinutes, "stagingFork.waitTimerMinutes");
	assertWaitTimerRange(waitTimer, "stagingFork.waitTimerMinutes");

	let userReviewers = parseCommaList(rules.reviewerUsers);
	const teamReviewers = parseCommaList(rules.reviewerTeams);
	if (userReviewers.length === 0 && teamReviewers.length === 0 && reviewerFallbackEffective) {
		userReviewers = [getGitHubActorLogin()];
	}

	const branchPatterns = parseCommaList(rules.branchPatterns);

	const deploymentBranchPolicy = deploymentBranchPolicyFor(
		rules.deploymentBranchProtectedOnly,
		branchPatterns,
		"staging-fork environment",
	);

	return {
		adminBypass: true,
		waitTimer,
		preventSelfReview: rules.preventSelfReview,
		reviewers: { users: userReviewers, teams: teamReviewers },
		...(deploymentBranchPolicy ? { deploymentBranchPolicy } : {}),
		...(branchPatterns.length > 0 ? { branchPatterns } : {}),
	};
}
