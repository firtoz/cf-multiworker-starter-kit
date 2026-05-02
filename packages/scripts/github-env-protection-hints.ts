/**
 * Human-readable copy for **`bun run github:setup`** / **`setup:staging`** about GitHub Environment protection.
 * Not imported by CI — keep wording aligned with `.github/workflows/deploy-pr-preview.yml` and **`stacks/admin.ts`**.
 */
export const GITHUB_ENV_PROTECTION_HINT_LINES = [
	"**PR preview deploys** use GitHub Environment **`staging`** (workflow **deployment** approval, not PR review).",
	"",
	"**Recommended default:** add **Required reviewers** on **`staging`** who are **admins** (or a small trusted team).",
	"That way untrusted code on a PR branch cannot run **`bun install` / deploy** until an admin approves the pending deployment in the Actions UI.",
	"",
	"**Trusting more collaborators:** you can add reviewers with **write** access instead of only admins — understand they can approve runs that execute the PR branch.",
	"",
	"**Fork PRs:** preview deploy/destroy for forks is **off** unless a **repository** variable **`CF_STARTER_ALLOW_PREVIEW_FOR_FORK_PRS=true`** is set",
	"(Settings → Secrets and variables → Actions → **Variables** — not the `staging` Environment). Same-repo PRs are unchanged.",
	"",
	"Configure **`staging`** / **`production`** shells + rules: **`bun run github:env:staging`** / **`github:env:prod`** (or **`github:env`**) with **`GITHUB_SYNC_ENVIRONMENT_ONLY_CONFIRM=true`** and every **`GITHUB_ENV_*`** — see **`stacks/github-repository-environment-from-env.ts`**.",
] as const;
