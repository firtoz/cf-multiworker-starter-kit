/**
 * Optional GitHub Environment **deployment protection** for `alchemy/github` **`RepositoryEnvironment`**,
 * driven by **`GITHUB_ENV_*`** process env.
 *
 * - **`repositoryEnvironmentProtectionOverlayForAdminSync`**: only fields you explicitly set — merge onto
 *   **`github:sync:*`** so a sync without these vars does not change deployment rules configured elsewhere.
 * - **`repositoryEnvironmentProtectionForEnvOnlyDeploy`**: props for **`github:env:*`** (explicit defaults
 *   where useful so one command can set reviewers without a prior sync).
 */
import type { RepositoryEnvironmentProps } from "alchemy/github";

function parseCommaList(raw: string | undefined): string[] {
	if (!raw) {
		return [];
	}
	return raw
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

function parseOptionalInt(raw: string | undefined, label: string): number | undefined {
	if (raw === undefined || raw.trim() === "") {
		return undefined;
	}
	const n = Number.parseInt(raw.trim(), 10);
	if (!Number.isFinite(n)) {
		throw new Error(`${label} must be a finite integer (got ${JSON.stringify(raw)})`);
	}
	return n;
}

function parseBool(raw: string | undefined, defaultValue: boolean): boolean {
	if (raw === undefined || raw.trim() === "") {
		return defaultValue;
	}
	const t = raw.trim().toLowerCase();
	if (t === "1" || t === "true" || t === "yes" || t === "on") {
		return true;
	}
	if (t === "0" || t === "false" || t === "no" || t === "off") {
		return false;
	}
	throw new Error(`Expected boolean string for env flag (got ${JSON.stringify(raw)})`);
}

function assertWaitTimerRange(waitTimer: number): void {
	if (waitTimer < 0 || waitTimer > 43200) {
		throw new Error("GITHUB_ENV_WAIT_TIMER_MINUTES must be between 0 and 43200");
	}
}

type ProtectionPick = Pick<
	RepositoryEnvironmentProps,
	"waitTimer" | "preventSelfReview" | "reviewers" | "deploymentBranchPolicy" | "branchPatterns"
>;

/** Non-destructive merge for `stacks/admin.ts` — only keys backed by a non-empty env value. */
export function repositoryEnvironmentProtectionOverlayForAdminSync(): Partial<ProtectionPick> {
	const out: Partial<ProtectionPick> = {};

	const userReviewers = parseCommaList(process.env["GITHUB_ENV_DEPLOYMENT_REVIEWER_USERS"]);
	const teamReviewers = parseCommaList(process.env["GITHUB_ENV_DEPLOYMENT_REVIEWER_TEAMS"]);
	if (userReviewers.length > 0 || teamReviewers.length > 0) {
		out.reviewers = { users: userReviewers, teams: teamReviewers };
	}

	const waitRaw = process.env["GITHUB_ENV_WAIT_TIMER_MINUTES"]?.trim();
	if (waitRaw) {
		const waitTimer = parseOptionalInt(waitRaw, "GITHUB_ENV_WAIT_TIMER_MINUTES") ?? 0;
		assertWaitTimerRange(waitTimer);
		out.waitTimer = waitTimer;
	}

	if (process.env["GITHUB_ENV_PREVENT_SELF_REVIEW"]?.trim()) {
		out.preventSelfReview = parseBool(process.env["GITHUB_ENV_PREVENT_SELF_REVIEW"], false);
	}

	const protectedBranchesOnly = process.env["GITHUB_ENV_DEPLOYMENT_BRANCH_PROTECTED_ONLY"]?.trim();
	const branchPatternsRaw = process.env["GITHUB_ENV_DEPLOYMENT_BRANCH_CUSTOM_PATTERNS"]?.trim();
	if (protectedBranchesOnly || branchPatternsRaw) {
		const branchPatterns = parseCommaList(process.env["GITHUB_ENV_DEPLOYMENT_BRANCH_CUSTOM_PATTERNS"]);
		out.deploymentBranchPolicy = {
			protectedBranches: parseBool(process.env["GITHUB_ENV_DEPLOYMENT_BRANCH_PROTECTED_ONLY"], false),
			customBranchPolicies: branchPatterns.length > 0,
		};
		if (branchPatterns.length > 0) {
			out.branchPatterns = branchPatterns;
		}
	}

	return out;
}

/** Full protection block for `stacks/github-environment-only.ts` (no secrets). */
export function repositoryEnvironmentProtectionForEnvOnlyDeploy(): ProtectionPick & {
	adminBypass: boolean;
} {
	const userReviewers = parseCommaList(process.env["GITHUB_ENV_DEPLOYMENT_REVIEWER_USERS"]);
	const teamReviewers = parseCommaList(process.env["GITHUB_ENV_DEPLOYMENT_REVIEWER_TEAMS"]);
	const waitTimer = parseOptionalInt(process.env["GITHUB_ENV_WAIT_TIMER_MINUTES"], "GITHUB_ENV_WAIT_TIMER_MINUTES") ?? 0;
	assertWaitTimerRange(waitTimer);

	const preventSelfReview = parseBool(process.env["GITHUB_ENV_PREVENT_SELF_REVIEW"], false);
	const protectedBranchesOnly = parseBool(process.env["GITHUB_ENV_DEPLOYMENT_BRANCH_PROTECTED_ONLY"], false);
	const branchPatterns = parseCommaList(process.env["GITHUB_ENV_DEPLOYMENT_BRANCH_CUSTOM_PATTERNS"]);

	const reviewers =
		userReviewers.length > 0 || teamReviewers.length > 0
			? { users: userReviewers, teams: teamReviewers }
			: undefined;

	const deploymentBranchPolicy =
		protectedBranchesOnly || branchPatterns.length > 0
			? {
					protectedBranches: protectedBranchesOnly,
					customBranchPolicies: branchPatterns.length > 0,
				}
			: undefined;

	return {
		adminBypass: true,
		waitTimer,
		preventSelfReview,
		...(reviewers ? { reviewers } : {}),
		...(deploymentBranchPolicy ? { deploymentBranchPolicy } : {}),
		...(branchPatterns.length > 0 ? { branchPatterns } : {}),
	};
}
