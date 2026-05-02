/**
 * PR preview workflows use **two** GitHub Environments with the same secrets (mirrored by **`github:sync:staging`**):
 *
 * - **`PR_PREVIEW_SAME_REPO_GITHUB_ENVIRONMENT`** — PRs whose head branch lives **on this repo** (internal contributors).
 *   Keep deployment protection **open** here if you want previews to run without a deployment-approval click
 *   (still subject to `CF_STARTER_DEPLOY_ENABLED`, etc.).
 *
 * - **`PR_PREVIEW_FORK_GITHUB_ENVIRONMENT`** — **fork** PRs (external). Configure **Required reviewers** (or other rules)
 *   on this environment in GitHub so untrusted code waits for an explicit deployment approval.
 *
 * Keep names in sync with **`.github/workflows/deploy-pr-preview.yml`**.
 */
export const PR_PREVIEW_SAME_REPO_GITHUB_ENVIRONMENT = "staging" as const;
export const PR_PREVIEW_FORK_GITHUB_ENVIRONMENT = "staging-fork" as const;
