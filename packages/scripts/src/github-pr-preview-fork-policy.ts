/**
 * GitHub Environments for PR-related policy (mirrored by **`github:sync:staging`**):
 *
 * - **`PR_PREVIEW_SAME_REPO_GITHUB_ENVIRONMENT`** — same-repo PR previews use **`staging`** (see **`.github/workflows/pr-deploy.yml`**).
 *
 * - **`PR_PREVIEW_FORK_GITHUB_ENVIRONMENT`** — **`staging-fork`**: optional shell for policy/sync; **fork PRs no longer run preview deploy** in stock workflows (Quality only).
 *
 * Keep **`staging-fork`** name in sync with **`config/github.policy.ts`** / admin sync.
 */
export const PR_PREVIEW_SAME_REPO_GITHUB_ENVIRONMENT = "staging" as const;
export const PR_PREVIEW_FORK_GITHUB_ENVIRONMENT = "staging-fork" as const;
