/**
 * GitHub **repository rulesets** (REST) — complements **`github-repository-settings-sync.ts`**.
 * Runs on **`github:sync:staging`** when **`config/github.policy.ts`** has **`github.sync.applyRulesets`** set.
 *
 * Defaults: **`main`** — PR-only for **Write** and **Maintain** roles; **Repository admin** may bypass (direct push).
 * Optional status checks. **`production`** — PR rules for everyone, no admin bypass in defaults, optional **workflows** gate.
 *
 * @see https://docs.github.com/en/rest/repos/rules
 */

import { Octokit } from "@octokit/rest";
import type { GitHubPolicyConfig } from "../packages/alchemy-utils/src/github-policy-config";

export const CF_STARTER_PRODUCTION_PR_HEAD_VARIABLE = "CF_STARTER_PRODUCTION_PR_HEAD";

/** Built-in github.com “Repository admin” repository role id for ruleset `bypass_actors` (`RepositoryRole`). */
const GITHUB_RULESET_BUILTIN_REPOSITORY_ROLE_ADMIN_ACTOR_ID = 5;

type RulesetBypassActorPayload = {
	actor_id: number;
	actor_type: "RepositoryRole";
	bypass_mode: "always" | "pull_request" | "exempt";
};

function mainRulesetBypassActors(
	main: GitHubPolicyConfig["github"]["repository"]["rulesets"]["main"],
): RulesetBypassActorPayload[] {
	if (!main.requirePullRequestBeforeMerge || !main.allowRepositoryAdminBypassOnMain) {
		return [];
	}
	return [
		{
			actor_id: GITHUB_RULESET_BUILTIN_REPOSITORY_ROLE_ADMIN_ACTOR_ID,
			actor_type: "RepositoryRole",
			bypass_mode: "always",
		},
	];
}

function approvingReviewCountFor(
	policy: GitHubPolicyConfig["github"]["repository"]["rulesets"]["pullRequest"],
	which: "main" | "production",
): number {
	const shared = policy.sharedRequiredApprovingReviewCount;
	const main = policy.mainRequiredApprovingReviewCount;
	const prod = policy.productionRequiredApprovingReviewCount;
	if (which === "main") {
		return main ?? shared ?? 0;
	}
	return prod ?? shared ?? 0;
}

function pullRequestRule(
	policy: GitHubPolicyConfig["github"]["repository"]["rulesets"],
	which: "main" | "production",
): {
	type: "pull_request";
	parameters: {
		allowed_merge_methods: ("merge" | "rebase" | "squash")[];
		dismiss_stale_reviews_on_push: boolean;
		require_code_owner_review: boolean;
		require_last_push_approval: boolean;
		required_approving_review_count: number;
		required_review_thread_resolution: boolean;
	};
} {
	const pr = policy.pullRequest;
	return {
		type: "pull_request",
		parameters: {
			allowed_merge_methods: [...pr.allowedMergeMethods],
			dismiss_stale_reviews_on_push: pr.dismissStaleReviewsOnPush,
			require_code_owner_review: pr.requireCodeOwnerReview,
			require_last_push_approval: pr.requireLastPushApproval,
			required_approving_review_count: approvingReviewCountFor(pr, which),
			required_review_thread_resolution: pr.requiredReviewThreadResolution,
		},
	};
}

function mainStatusCheckRules(
	main: GitHubPolicyConfig["github"]["repository"]["rulesets"]["main"],
): { type: "required_status_checks"; parameters: Record<string, unknown> }[] {
	const contexts = [...main.requiredStatusCheckContexts];
	if (contexts.length === 0) {
		return [];
	}
	return [
		{
			type: "required_status_checks",
			parameters: {
				do_not_enforce_on_create: true,
				strict_required_status_checks_policy: main.strictRequiredStatusChecks,
				required_status_checks: contexts.map((context) => ({ context })),
			},
		},
	];
}

async function upsertRepoVariable(
	octokit: InstanceType<typeof Octokit>,
	owner: string,
	repo: string,
	name: string,
	value: string,
): Promise<void> {
	try {
		await octokit.rest.actions.getRepoVariable({ owner, repo, name });
		await octokit.rest.actions.updateRepoVariable({ owner, repo, name, value });
	} catch (error: unknown) {
		const err = error as { status?: number };
		if (err.status === 404) {
			await octokit.rest.actions.createRepoVariable({ owner, repo, name, value });
			return;
		}
		throw error;
	}
}

/**
 * Rulesets validate the workflows rule against the live tree. A missing file yields 422 with an
 * opaque "Workflow error at index 0" message — check first so forks get a direct next step.
 */
async function assertRemoteWorkflowFileForRuleset(
	octokit: InstanceType<typeof Octokit>,
	owner: string,
	repo: string,
	workflowPath: string,
	ref: string,
): Promise<void> {
	try {
		const { data } = await octokit.rest.repos.getContent({
			owner,
			repo,
			path: workflowPath,
			ref,
		});
		if (Array.isArray(data) || data.type !== "file") {
			throw new Error(
				`Ruleset workflows rule path ${workflowPath} at ref ${ref} must be a workflow file in ${owner}/${repo}.`,
			);
		}
	} catch (error: unknown) {
		const err = error as { status?: number };
		if (err.status === 404) {
			throw new Error(
				`Cannot create/update the production ruleset workflows rule: ${workflowPath} is not present on the remote at ref ${ref} for ${owner}/${repo}. Merge or push that workflow to that ref first, or set github.repository.rulesets.production.requireSourceWorkflowGate to false in config/github.policy.ts until it exists.`,
			);
		}
		throw error;
	}
}

async function findRulesetIdByName(
	octokit: InstanceType<typeof Octokit>,
	owner: string,
	repo: string,
	name: string,
): Promise<number | undefined> {
	const rulesets = await octokit.paginate(octokit.rest.repos.getRepoRulesets, {
		owner,
		repo,
		per_page: 100,
	});
	const hit = rulesets.find((r) => r.name === name);
	return hit?.id;
}

async function upsertRuleset(
	octokit: InstanceType<typeof Octokit>,
	owner: string,
	repo: string,
	body: {
		name: string;
		enforcement: "active" | "disabled" | "evaluate";
		conditions: { ref_name: { include: string[]; exclude: string[] } };
		rules: Record<string, unknown>[];
		bypassActors: RulesetBypassActorPayload[];
	},
): Promise<void> {
	const existingId = await findRulesetIdByName(octokit, owner, repo, body.name);
	const payload = {
		name: body.name,
		target: "branch" as const,
		enforcement: body.enforcement,
		conditions: body.conditions,
		rules: body.rules as never,
		bypass_actors: body.bypassActors as never,
	};
	if (existingId === undefined) {
		await octokit.rest.repos.createRepoRuleset({
			owner,
			repo,
			...payload,
		});
		return;
	}
	await octokit.rest.repos.updateRepoRuleset({
		owner,
		repo,
		ruleset_id: existingId,
		...payload,
	});
}

export async function applyGitHubRepoRulesets(opts: {
	policy: GitHubPolicyConfig;
	owner: string;
	repository: string;
	token: string;
}): Promise<void> {
	const { policy, owner, repository: repo, token } = opts;
	const octokit = new Octokit({ auth: token });
	const rules = policy.github.repository.rulesets;
	const enforcement = rules.enforcement;

	const { data: repoMeta } = await octokit.rest.repos.get({
		owner,
		repo,
	});
	const repositoryId = repoMeta.id;

	const mainEnabled = rules.main.enabled;
	const productionEnabled = rules.production.enabled;

	const mainInclude = [...rules.main.includeRefs];
	const productionInclude = [...rules.production.includeRefs];

	const mainName = rules.main.displayName;
	const productionName = rules.production.displayName;

	const productionWorkflowPath = rules.production.gateWorkflowPath;
	const productionWorkflowRef = rules.production.gateWorkflowRef;

	const requireProductionSourceWorkflow = rules.production.requireSourceWorkflowGate;
	const productionSourceBranch = rules.production.sourceBranchForProductionPrs;

	const results: {
		productionPrHeadVariable?: string;
		mainRuleset?: string;
		productionRuleset?: string;
	} = {};

	if (productionEnabled && requireProductionSourceWorkflow) {
		await upsertRepoVariable(
			octokit,
			owner,
			repo,
			CF_STARTER_PRODUCTION_PR_HEAD_VARIABLE,
			productionSourceBranch,
		);
		results.productionPrHeadVariable = `${CF_STARTER_PRODUCTION_PR_HEAD_VARIABLE}=${productionSourceBranch}`;
	}

	function branchRulesWithoutOptionalChecks(
		which: "main" | "production",
	): Record<string, unknown>[] {
		const rs: Record<string, unknown>[] = [];
		if (which === "main") {
			if (rules.main.requirePullRequestBeforeMerge) {
				rs.push(pullRequestRule(rules, "main") as unknown as Record<string, unknown>);
			}
		} else {
			rs.push(pullRequestRule(rules, "production") as unknown as Record<string, unknown>);
		}
		rs.push({ type: "non_fast_forward" });
		return rs;
	}

	try {
		if (mainEnabled) {
			const rs = [...branchRulesWithoutOptionalChecks("main"), ...mainStatusCheckRules(rules.main)];
			await upsertRuleset(octokit, owner, repo, {
				name: mainName,
				enforcement,
				conditions: { ref_name: { include: mainInclude, exclude: [] } },
				rules: rs,
				bypassActors: mainRulesetBypassActors(rules.main),
			});
			results.mainRuleset = mainName;
		}

		if (productionEnabled) {
			const rs: Record<string, unknown>[] = [...branchRulesWithoutOptionalChecks("production")];
			if (requireProductionSourceWorkflow) {
				await assertRemoteWorkflowFileForRuleset(
					octokit,
					owner,
					repo,
					productionWorkflowPath,
					productionWorkflowRef,
				);
				rs.push({
					type: "workflows",
					parameters: {
						do_not_enforce_on_create: true,
						workflows: [
							{
								path: productionWorkflowPath,
								ref: productionWorkflowRef,
								repository_id: repositoryId,
							},
						],
					},
				});
			}
			await upsertRuleset(octokit, owner, repo, {
				name: productionName,
				enforcement,
				conditions: { ref_name: { include: productionInclude, exclude: [] } },
				rules: rs,
				bypassActors: [],
			});
			results.productionRuleset = productionName;
		}
	} catch (error: unknown) {
		const err = error as { status?: number; message?: string };
		if (err.status === 401) {
			throw new Error("GitHub authentication failed while updating repository rulesets.");
		}
		if (err.status === 403) {
			throw new Error(
				"Insufficient permissions to manage repository rulesets or Actions variables (need admin on the repository).",
			);
		}
		throw error;
	}

	console.log({
		githubRepoRulesets: {
			repository: `${owner}/${repo}`,
			enforcement,
			mainEnabled,
			productionEnabled,
			requireProductionSourceWorkflow,
			...results,
		},
	});
}
