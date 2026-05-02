/**
 * Repo-level GitHub settings via REST (not Alchemy resources — `alchemy/github` has no Repository
 * provider). Runs during **`bun run github:sync:staging`** (or the first half of **`bun run github:sync`**) when
 * **`config/github.policy.ts`** has **`applyRepositorySettings`** enabled — merge toggles only; branch rules live in **rulesets**
 * (`stacks/github-repo-rulesets-sync.ts`).
 *
 * Token needs **admin** on the repo (same as repository settings in the GitHub UI).
 *
 * @see https://docs.github.com/en/rest/repos/repos#update-a-repository
 */

import type { GitHubPolicyConfig } from "../packages/alchemy-utils/src/github-policy-config";
import { shouldApplyGithubRepositoryRestPolicy } from "../packages/alchemy-utils/src/github-policy-config";
import { Octokit } from "@octokit/rest";

export async function applyGitHubRepositoryPolicy(opts: {
	policy: GitHubPolicyConfig;
	owner: string;
	repository: string;
	token: string;
}): Promise<void> {
	const { policy, owner, repository: repo, token } = opts;
	const octokit = new Octokit({ auth: token });

	const repoSettings = policy.github.repository;

	const deleteBranchOnMerge = repoSettings.merge.deleteBranchOnMerge;
	const allowSquashMerge = repoSettings.merge.allowSquashMerge;
	const allowMergeCommit = repoSettings.merge.allowMergeCommit;
	const allowRebaseMerge = repoSettings.merge.allowRebaseMerge;
	const allowAutoMerge = repoSettings.merge.allowAutoMerge;

	if (shouldApplyGithubRepositoryRestPolicy(policy)) {
		try {
			await octokit.rest.repos.update({
				owner,
				repo,
				delete_branch_on_merge: deleteBranchOnMerge,
				allow_squash_merge: allowSquashMerge,
				allow_merge_commit: allowMergeCommit,
				allow_rebase_merge: allowRebaseMerge,
				allow_auto_merge: allowAutoMerge,
			});
		} catch (error: unknown) {
			const err = error as { status?: number; message?: string };
			if (err.status === 401) {
				throw new Error("GitHub authentication failed while updating repository settings.");
			}
			if (err.status === 403) {
				throw new Error(
					"Insufficient permissions to update repository settings (need admin on the repo). Grant `repo` scope or organization owner access.",
				);
			}
			throw error;
		}
	}

	console.log({
		githubRepositorySettings: {
			repository: `${owner}/${repo}`,
			repositorySettingsApplied: shouldApplyGithubRepositoryRestPolicy(policy),
			delete_branch_on_merge: deleteBranchOnMerge,
			allow_squash_merge: allowSquashMerge,
			allow_merge_commit: allowMergeCommit,
			allow_rebase_merge: allowRebaseMerge,
			allow_auto_merge: allowAutoMerge,
		},
	});
}
