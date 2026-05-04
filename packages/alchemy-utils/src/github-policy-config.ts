/**
 * Typed GitHub **repository policy** for admin sync (`stacks/admin.ts`).
 *
 * - **Secrets** and stage deploy values live in gitignored `.env.*`.
 * - **This config** (see repo root `config/github.policy.ts`) is versioned and reviewed like code.
 * - **`GITHUB_SYNC_PUSH_SECRETS`** / **`GITHUB_SYNC_UPDATE_ENVIRONMENT_PROTECTION`** defaults live in **`stacks/admin.ts`** (see that file header), **`.env.example`**, and **`repo-root-env-requirements.ts`** — not here.
 *
 * No `GITHUB_RULESET_*` / `GITHUB_BRANCH_*` / `GITHUB_REPO_*` / `GITHUB_ENV_*` env overrides — forks are fresh templates.
 */

export type RulesetEnforcement = "active" | "evaluate" | "disabled";

export type MergeMethod = "merge" | "rebase" | "squash";

/** GitHub Actions Environment deployment protection (who approves a deployment). */
export type GithubEnvironmentDeploymentRules = {
	readonly waitTimerMinutes: number;
	readonly preventSelfReview: boolean;
	readonly deploymentBranchProtectedOnly: boolean;
	readonly reviewerUsers: readonly string[];
	readonly reviewerTeams: readonly string[];
	readonly branchPatterns: readonly string[];
};

/** Synthetic reviewer when **`reviewerUsers`** / **`reviewerTeams`** are empty (`staging-fork` only). */
export type GithubStagingForkReviewerFallbackMode = boolean | "auto";

export type GithubStagingForkDeploymentRules = GithubEnvironmentDeploymentRules & {
	/**
	 * When **true** and both reviewer lists are empty, sync uses the current **`gh`** login or **`GITHUB_ACTOR`** as a required reviewer on **`staging-fork`** (legacy/future fork preview workflows would wait for approval).
	 * **`false`** — never inject that reviewer.
	 * **`"auto"`** — **`resolveStagingForkReviewerFallbackToActor`**: **public** / **internal** repos default **on**; **private** stays **off** unless **`GITHUB_SYNC_STAGING_FORK_REVIEWERS_PRIVATE=1`** during sync (Team+/plans that allow Environment reviewers).
	 */
	readonly reviewerFallbackToActor: GithubStagingForkReviewerFallbackMode;
};

export type GithubRepoVisibility = "public" | "private" | "internal";

/**
 * Effective **`reviewerFallbackToActor`** for **`staging-fork`** when policy uses **`"auto"`**.
 *
 * @param forceReviewerFallbackOnPrivateRepo — set when **`GITHUB_SYNC_STAGING_FORK_REVIEWERS_PRIVATE=1`** (private repo on a plan that supports required deployment reviewers).
 */
export function resolveStagingForkReviewerFallbackToActor(
	rules: GithubStagingForkDeploymentRules,
	repo: { readonly visibility: GithubRepoVisibility },
	options?: { readonly forceReviewerFallbackOnPrivateRepo?: boolean },
): boolean {
	const mode = rules.reviewerFallbackToActor;
	if (mode === true) {
		return true;
	}
	if (mode === false) {
		return false;
	}
	if (repo.visibility === "public") {
		return true;
	}
	if (repo.visibility === "internal") {
		return true;
	}
	return Boolean(options?.forceReviewerFallbackOnPrivateRepo);
}

export type GithubRepoSyncFlags = {
	/** When **false**, skip repository merge-settings PATCH during staging sync. */
	readonly applyRepositorySettings: boolean;
	/** Upsert repository rulesets (staging sync only). */
	readonly applyRulesets: boolean;
};

export type GithubRepositoryMergeSettings = {
	readonly deleteBranchOnMerge: boolean;
	readonly allowSquashMerge: boolean;
	readonly allowMergeCommit: boolean;
	readonly allowRebaseMerge: boolean;
	readonly allowAutoMerge: boolean;
};

export type GithubRepositoryActionsSettings = {
	readonly defaultWorkflowPermissions: "read" | "write";
	readonly allowGitHubActionsToCreateAndApprovePullRequests: boolean;
};

export type GithubRulesetPullRequestParameters = {
	readonly allowedMergeMethods: readonly MergeMethod[];
	readonly dismissStaleReviewsOnPush: boolean;
	readonly requireCodeOwnerReview: boolean;
	readonly requireLastPushApproval: boolean;
	readonly requiredReviewThreadResolution: boolean;
	/**
	 * Approving reviews (from people with **write** access) required before merge.
	 * Default **0** so a solo maintainer can merge; set **1+** when you want teammates to review.
	 * Override per branch with **`mainRequiredApprovingReviewCount`** / **`productionRequiredApprovingReviewCount`**.
	 */
	readonly sharedRequiredApprovingReviewCount: number;
	/** Overrides **`sharedRequiredApprovingReviewCount`** for the **main** ruleset only. */
	readonly mainRequiredApprovingReviewCount?: number;
	/** Overrides **`sharedRequiredApprovingReviewCount`** for the **production** ruleset only. */
	readonly productionRequiredApprovingReviewCount?: number;
};

export type GithubRulesetBranchProfile = {
	readonly enabled: boolean;
	readonly displayName: string;
	readonly includeRefs: readonly string[];
};

export type GithubRulesetMainExtensions = {
	/**
	 * When **true**, the **main** ruleset includes GitHub’s *require a pull request before merging* rule
	 * (direct pushes to `main` are rejected for most collaborators). **`production`** always uses that rule.
	 * Use **`allowRepositoryAdminBypassOnMain`** so users with the repo **Admin** role (including the owner)
	 * can still push directly. Set both to **false** if you want `main` open to anyone with push access.
	 */
	readonly requirePullRequestBeforeMerge: boolean;
	/**
	 * When **requirePullRequestBeforeMerge** is **true**, add a ruleset bypass for the built-in **Repository admin**
	 * role (`RepositoryRole` actor id **5** on github.com) with **`bypass_mode: always`**, so admins can push to `main`
	 * while **Write** / **Maintain** users must use PRs. No effect when **requirePullRequestBeforeMerge** is **false**.
	 * **`production`** ruleset intentionally has **no** such bypass in the default policy.
	 */
	readonly allowRepositoryAdminBypassOnMain: boolean;
	readonly requiredStatusCheckContexts: readonly string[];
	readonly strictRequiredStatusChecks: boolean;
};

export type GithubRulesetProductionExtensions = {
	readonly requireSourceBranchStatusCheckGate: boolean;
	readonly sourceBranchForProductionPrs: string;
	/**
	 * Required-status-check **context** for rulesets. For GitHub Actions workflows this must be
	 * **`{workflow name} / {job name}`** (see GitHub ruleset troubleshooting). Must stay in sync with
	 * **`name:`** + the job’s **`name:`** in **`.github/workflows/restrict-production-pr-source.yml`**,
	 * and with the **`name`** field when posting check runs from **`main-push.yml`**.
	 */
	readonly sourceBranchStatusCheckContext: string;
	readonly strictSourceBranchStatusChecks: boolean;
};

export type GithubRulesetsConfig = {
	readonly enforcement: RulesetEnforcement;
	readonly main: GithubRulesetBranchProfile & GithubRulesetMainExtensions;
	readonly production: GithubRulesetBranchProfile & GithubRulesetProductionExtensions;
	readonly pullRequest: GithubRulesetPullRequestParameters;
};

export type GitHubPolicyConfig = {
	readonly github: {
		readonly sync: GithubRepoSyncFlags;
		readonly environments: {
			readonly staging: GithubEnvironmentDeploymentRules;
			readonly production: GithubEnvironmentDeploymentRules;
			readonly stagingFork: GithubStagingForkDeploymentRules;
		};
		readonly repository: {
			readonly actions: GithubRepositoryActionsSettings;
			readonly merge: GithubRepositoryMergeSettings;
			readonly rulesets: GithubRulesetsConfig;
		};
	};
};

function assertRange(label: string, n: number, min: number, max: number): void {
	if (!Number.isFinite(n) || n < min || n > max) {
		throw new Error(`${label} must be between ${min} and ${max} (got ${JSON.stringify(n)})`);
	}
}

/**
 * Opinionated starter template — merge settings + repository rulesets + Environment rules.
 *
 * **`main.requiredStatusCheckContexts`** must match a normal caller-level job, not an inner job from
 * **`quality-reusable.yml`**. GitHub can show reusable-workflow inner checks as green while rulesets
 * keep the same visible name stuck as **Expected — Waiting for status to be reported**. Stock PRs
 * satisfy the plain **`Quality checks`** caller-level job from **`.github/workflows/pr-deploy.yml`**;
 * GitHub's PR UI may display it as **`PR preview / Quality checks (pull_request)`**, but the ruleset
 * picker stores the unprefixed **`Quality checks`** context.
 */
export const DEFAULT_GITHUB_POLICY: GitHubPolicyConfig = {
	github: {
		sync: {
			applyRepositorySettings: true,
			applyRulesets: true,
		},
		environments: {
			staging: {
				waitTimerMinutes: 0,
				preventSelfReview: false,
				deploymentBranchProtectedOnly: false,
				reviewerUsers: [],
				reviewerTeams: [],
				branchPatterns: [],
			},
			production: {
				waitTimerMinutes: 0,
				preventSelfReview: false,
				deploymentBranchProtectedOnly: false,
				reviewerUsers: [],
				reviewerTeams: [],
				branchPatterns: [],
			},
			stagingFork: {
				waitTimerMinutes: 0,
				preventSelfReview: true,
				deploymentBranchProtectedOnly: false,
				reviewerUsers: [],
				reviewerTeams: [],
				branchPatterns: [],
				reviewerFallbackToActor: "auto",
			},
		},
		repository: {
			actions: {
				defaultWorkflowPermissions: "read",
				allowGitHubActionsToCreateAndApprovePullRequests: true,
			},
			merge: {
				deleteBranchOnMerge: true,
				allowSquashMerge: true,
				allowMergeCommit: true,
				allowRebaseMerge: false,
				allowAutoMerge: true,
			},
			rulesets: {
				enforcement: "active",
				main: {
					enabled: true,
					displayName: "multiworker: main",
					includeRefs: ["refs/heads/main"],
					requirePullRequestBeforeMerge: true,
					allowRepositoryAdminBypassOnMain: true,
					requiredStatusCheckContexts: ["Quality checks"],
					strictRequiredStatusChecks: true,
				},
				production: {
					enabled: true,
					displayName: "multiworker: production",
					includeRefs: ["refs/heads/production"],
					requireSourceBranchStatusCheckGate: true,
					sourceBranchForProductionPrs: "main",
					sourceBranchStatusCheckContext:
						"Restrict production PR source / Production merge source",
					strictSourceBranchStatusChecks: true,
				},
				pullRequest: {
					allowedMergeMethods: ["squash", "merge"],
					dismissStaleReviewsOnPush: true,
					requireCodeOwnerReview: false,
					requireLastPushApproval: false,
					requiredReviewThreadResolution: false,
					sharedRequiredApprovingReviewCount: 0,
				},
			},
		},
	},
} as const satisfies GitHubPolicyConfig;

export function assertGithubPolicyConfig(policy: GitHubPolicyConfig): void {
	const { github } = policy;
	for (const label of ["staging", "production"] as const) {
		const e = github.environments[label];
		assertRange(`github.environments.${label}.waitTimerMinutes`, e.waitTimerMinutes, 0, 43_200);
	}
	assertRange(
		"github.environments.stagingFork.waitTimerMinutes",
		github.environments.stagingFork.waitTimerMinutes,
		0,
		43_200,
	);

	const pr = github.repository.rulesets.pullRequest;
	assertRange(
		"github.repository.rulesets.pullRequest.sharedRequiredApprovingReviewCount",
		pr.sharedRequiredApprovingReviewCount,
		0,
		6,
	);
	if (pr.mainRequiredApprovingReviewCount !== undefined) {
		assertRange(
			"github.repository.rulesets.pullRequest.mainRequiredApprovingReviewCount",
			pr.mainRequiredApprovingReviewCount,
			0,
			6,
		);
	}
	if (pr.productionRequiredApprovingReviewCount !== undefined) {
		assertRange(
			"github.repository.rulesets.pullRequest.productionRequiredApprovingReviewCount",
			pr.productionRequiredApprovingReviewCount,
			0,
			6,
		);
	}

	const enf = github.repository.rulesets.enforcement;
	if (enf !== "active" && enf !== "evaluate" && enf !== "disabled") {
		throw new Error(
			`github.repository.rulesets.enforcement must be active, evaluate, or disabled (got ${JSON.stringify(enf)})`,
		);
	}

	const fb = github.environments.stagingFork.reviewerFallbackToActor;
	if (fb !== true && fb !== false && fb !== "auto") {
		throw new Error(
			`github.environments.stagingFork.reviewerFallbackToActor must be true, false, or "auto" (got ${JSON.stringify(fb)})`,
		);
	}

	if (github.repository.rulesets.pullRequest.allowedMergeMethods.length === 0) {
		throw new Error("github.repository.rulesets.pullRequest.allowedMergeMethods must be non-empty");
	}
	for (const m of github.repository.rulesets.pullRequest.allowedMergeMethods) {
		if (m !== "merge" && m !== "rebase" && m !== "squash") {
			throw new Error(`Unknown merge method ${JSON.stringify(m)}`);
		}
	}
}

export function shouldApplyGithubRepositoryRestPolicy(policy: GitHubPolicyConfig): boolean {
	return policy.github.sync.applyRepositorySettings;
}

export function shouldApplyGithubRulesets(policy: GitHubPolicyConfig): boolean {
	return policy.github.sync.applyRulesets;
}
