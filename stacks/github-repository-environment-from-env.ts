/**
 * **Explicit** GitHub Environment deployment protection for `alchemy/github` **`RepositoryEnvironment`**.
 *
 * Every input is **required** (must appear in `process.env`, including empty string where “none” is intended).
 * Used when **`GITHUB_SYNC_SCOPE=environment`** or when **`GITHUB_SYNC_SCOPE=secrets`** with
 * **`GITHUB_SYNC_UPDATE_ENVIRONMENT_PROTECTION=true`**.
 *
 * Required env (set empty string for “no users” / “no teams” / “no branch patterns”):
 * - `GITHUB_ENV_WAIT_TIMER_MINUTES` — `0`–`43200`
 * - `GITHUB_ENV_PREVENT_SELF_REVIEW` — `true` / `false`
 * - `GITHUB_ENV_DEPLOYMENT_BRANCH_PROTECTED_ONLY` — `true` / `false`
 * - `GITHUB_ENV_DEPLOYMENT_REVIEWER_USERS` — comma-separated logins, or empty
 * - `GITHUB_ENV_DEPLOYMENT_REVIEWER_TEAMS` — `org/slug` or `slug`, comma-separated, or empty
 * - `GITHUB_ENV_DEPLOYMENT_BRANCH_CUSTOM_PATTERNS` — comma-separated patterns, or empty
 */

const REQUIRED_ENV_NAMES = [
	"GITHUB_ENV_WAIT_TIMER_MINUTES",
	"GITHUB_ENV_PREVENT_SELF_REVIEW",
	"GITHUB_ENV_DEPLOYMENT_BRANCH_PROTECTED_ONLY",
	"GITHUB_ENV_DEPLOYMENT_REVIEWER_USERS",
	"GITHUB_ENV_DEPLOYMENT_REVIEWER_TEAMS",
	"GITHUB_ENV_DEPLOYMENT_BRANCH_CUSTOM_PATTERNS",
] as const;

function requireEnvRaw(name: (typeof REQUIRED_ENV_NAMES)[number]): string {
	if (process.env[name] === undefined) {
		throw new Error(
			[
				`Missing required env ${name} for GitHub environment deployment protection.`,
				`Set every key in: ${REQUIRED_ENV_NAMES.join(", ")}.`,
				`Use an empty string where you mean “none” (e.g. no reviewer users).`,
			].join(" "),
		);
	}
	return process.env[name]!;
}

function parseCommaList(raw: string): string[] {
	if (!raw.trim()) {
		return [];
	}
	return raw
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

function parseOptionalInt(raw: string, label: string): number {
	const n = Number.parseInt(raw.trim(), 10);
	if (!Number.isFinite(n)) {
		throw new Error(`${label} must be a finite integer (got ${JSON.stringify(raw)})`);
	}
	return n;
}

function parseBool(raw: string, label: string): boolean {
	const t = raw.trim().toLowerCase();
	if (t === "1" || t === "true" || t === "yes" || t === "on") {
		return true;
	}
	if (t === "0" || t === "false" || t === "no" || t === "off") {
		return false;
	}
	throw new Error(`${label} must be "true" or "false" (got ${JSON.stringify(raw)})`);
}

function assertWaitTimerRange(waitTimer: number, label: string): void {
	if (waitTimer < 0 || waitTimer > 43200) {
		throw new Error(`${label} must be between 0 and 43200`);
	}
}

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

/**
 * Reads **`GITHUB_ENV_*`** — every required key must be present (see module doc).
 */
export function parseExplicitRepositoryEnvironmentProtectionFromEnv(): ExplicitRepositoryEnvironmentProtection {
	for (const n of REQUIRED_ENV_NAMES) {
		requireEnvRaw(n);
	}

	const waitTimer = parseOptionalInt(
		requireEnvRaw("GITHUB_ENV_WAIT_TIMER_MINUTES"),
		"GITHUB_ENV_WAIT_TIMER_MINUTES",
	);
	assertWaitTimerRange(waitTimer, "GITHUB_ENV_WAIT_TIMER_MINUTES");

	const preventSelfReview = parseBool(
		requireEnvRaw("GITHUB_ENV_PREVENT_SELF_REVIEW"),
		"GITHUB_ENV_PREVENT_SELF_REVIEW",
	);
	const protectedBranchesOnly = parseBool(
		requireEnvRaw("GITHUB_ENV_DEPLOYMENT_BRANCH_PROTECTED_ONLY"),
		"GITHUB_ENV_DEPLOYMENT_BRANCH_PROTECTED_ONLY",
	);

	const userReviewers = parseCommaList(requireEnvRaw("GITHUB_ENV_DEPLOYMENT_REVIEWER_USERS"));
	const teamReviewers = parseCommaList(requireEnvRaw("GITHUB_ENV_DEPLOYMENT_REVIEWER_TEAMS"));
	const branchPatterns = parseCommaList(requireEnvRaw("GITHUB_ENV_DEPLOYMENT_BRANCH_CUSTOM_PATTERNS"));

	const reviewers = { users: userReviewers, teams: teamReviewers };

	const deploymentBranchPolicy = {
		protectedBranches: protectedBranchesOnly,
		customBranchPolicies: branchPatterns.length > 0,
	};

	return {
		adminBypass: true,
		waitTimer,
		preventSelfReview,
		reviewers,
		deploymentBranchPolicy,
		...(branchPatterns.length > 0 ? { branchPatterns } : {}),
	};
}
