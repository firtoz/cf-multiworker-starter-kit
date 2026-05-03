# GitHub Admin Sync

This repo can set up GitHub Actions Environments, secrets, variables, repo merge settings, and branch rulesets from a trusted local machine.

Most forks only need:

```bash
bun run onboard:staging
bun run onboard:prod
```

Use this page when you want to change how GitHub behaves after onboarding.

## CI and deploy workflows

- **Fresh forks:** deploy jobs **no-op** until **`MULTIWORKER_DEPLOY_ENABLED=true`** exists on each GitHub Environment that runs deploys (**`staging`**, **`staging-fork`** for fork PRs, **`production`**). Running **`bun run onboard:staging`** / **`onboard:prod`** (or **`github:sync:*`**) syncs secrets/variables and typically sets this.
- **Quality checks** (`.github/workflows/ci.yml`): runs on **push** and **pull_request** to **`main`** — Drizzle generated-artifact guard, typecheck, lint, **`bun run setup -- --yes`** (seed `.env.local`), build.
- **Staging deploy** (`.github/workflows/deploy-staging.yml`): runs after **Quality checks** complete **successfully** on a **push** to **`main`** (same **`head_sha`** — not on PR-only Quality runs). Uses Environment **`staging`**.
- **Production deploy** (`.github/workflows/deploy-production.yml`): **push** to **`production`** or **workflow_dispatch** when the selected ref is **`production`**.
- **PR previews** (`.github/workflows/deploy-pr-preview.yml`): **deploy** starts only after **Quality checks** finish **successfully** (`workflow_run` on **`Quality checks`** for **`pull_request`** events — same **`head_sha`** as CI). **same-repo** PR branches use Environment **`staging`**; **fork** PRs use **`staging-fork`** (deployment protection from **`config/github.policy.ts`** → **`github.environments.stagingFork`**). Preview stacks use **`STAGE=pr-<n>`**. **Teardown** uses **`pull_request.closed`** only — **not** chained to CI or **`workflow_run`** (close cancels in-flight preview runs via shared concurrency). Teardown checks out the **base** branch so destroy does not run untrusted PR scripts. **`alchemy destroy`** still loads **`alchemy.run.ts`** top-level **`requireEnv`** — mirror deploy **`env`** keys on the **`Turbo destroy (preview)`** step when you add vars used at module scope (see [**multiworker-gotchas** §22](../agents/skills/multiworker-gotchas/SKILL.md)).
- **Comments on PRs** with preview URLs come from **`pr-preview-comment.yml`** (**`workflow_run`**) so fork code never runs with a token that writes PR comments.

Use **`bun run github:setup`** for a step-by-step printout.

Onboarding wrappers (trusted machine, **`gh`** authenticated):

```bash
bun run github:setup
bun run onboard:staging
bun run onboard:prod
```

**`onboard:prod`** also sets repo variable **`MULTIWORKER_AUTO_PRODUCTION_PR=true`**, after which a successful **staging** deploy may **open or reuse** a PR **`main` → `production`**. You still **merge** that PR to ship production (and remote **`production`** must exist). `bun run github:sync:staging` also enables the repository Actions workflow permission that lets **`GITHUB_TOKEN`** create the production PR; if GitHub rejects that setting, enable it at the **organization or enterprise** level, then rerun staging sync.

**Default repo policy** (see [`config/github.policy.ts`](../config/github.policy.ts)): **`main`** — PRs for writers, admins may bypass; **`production`** — PR from **`main`**, no admin bypass by default; approving review count defaults to **0** for solo maintainers.

## Custom domains (web Worker)

The React Router app is the **frontend** Worker in [`apps/web/alchemy.run.ts`](../apps/web/alchemy.run.ts). Default deploys use **`workers.dev`** only.

1. Run **`bun run setup:prod`** or **`bun run setup:staging`** and use the **optional** menu entries at the bottom — or set the same keys in **`.env.production`** / **`.env.staging`** (see [`.env.example`](../.env.example)).
2. Typical: **`WEB_DOMAINS=example.com,www.example.com`**. Use **`WEB_ROUTES`** only if you need explicit patterns (e.g. `example.com/*`).
3. Optional: **`WEB_ZONE_ID`** (one zone for every entry), **`WEB_DOMAIN_OVERRIDE_EXISTING_ORIGIN=true`** when moving a hostname already bound elsewhere.
4. After editing dotfiles, run **`bun run github:sync:staging`** / **`github:sync:prod`** (or **`bun run github:sync`** if both exist) so GitHub Environment **variables** include **`WEB_*`** (plaintext vars — not secrets).

**PR previews** (`STAGE=pr-<n>`) stay on **`workers.dev`**: **`WEB_*`** values are **ignored** on preview deploys so preview stacks never steal production hostnames from shared Environment variables.

## Cloudflare credentials (manual)

Create tokens in the Cloudflare dashboard — **this repo does not create tokens** (no OAuth or scripted token creation).

1. **Account ID** — [Cloudflare dashboard](https://dash.cloudflare.com/) → your account → **Workers & Pages** or account overview → **Account ID**.
2. **API token** — [My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens) → **Create Token**. Quick path: **Edit Cloudflare Workers** template scoped to that account. Add **D1** if you use tighter scopes — [API tokens](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/).
3. Put **`CLOUDFLARE_API_TOKEN`** and **`CLOUDFLARE_ACCOUNT_ID`** in **`.env.staging`** / **`.env.production`** (or run **`bun run setup:staging`** / **`setup:prod`**). They must be the **same** Cloudflare account.

## Source Of Truth

- Stage secrets and variables live in `.env.staging` and `.env.production`.
- Repo policy lives in [`config/github.policy.ts`](../config/github.policy.ts).
- Sync code lives in [`stacks/admin.ts`](../stacks/admin.ts), [`stacks/github-repository-settings-sync.ts`](../stacks/github-repository-settings-sync.ts), and [`stacks/github-repo-rulesets-sync.ts`](../stacks/github-repo-rulesets-sync.ts).

After editing policy, run:

```bash
bun run typecheck:root
bun run github:sync:staging
```

`github:sync:prod` syncs production secrets and Environment settings. Repo REST settings and rulesets are applied during staging sync.

## Default Rules

`main`:

- Requires pull requests for Write/Maintain collaborators.
- Lets Repository admins bypass and push directly.
- Does not require approving reviews by default.
- Can require CI checks if you set `github.repository.rulesets.main.requiredStatusCheckContexts`.

`production`:

- Requires pull requests.
- Has no admin bypass by default.
- Blocks force-push.
- Requires the `Production merge source` status check, which is produced by [`restrict-production-pr-source.yml`](../.github/workflows/restrict-production-pr-source.yml) on **normal** `pull_request` events (humans / PAT-opened PRs). **PRs opened by Actions using `GITHUB_TOKEN` do not start other workflows**, so [`deploy-staging.yml`](../.github/workflows/deploy-staging.yml) also posts that check via the Checks API after it opens or reuses the **main → production** PR.
- That workflow only passes when the PR into `production` comes from the configured source branch, default `main`.

## Common Tweaks

Allow anyone with push access to push directly to `main`:

```ts
github: {
  repository: {
    rulesets: {
      main: {
        requirePullRequestBeforeMerge: false,
      },
    },
  },
}
```

Require reviews:

```ts
github: {
  repository: {
    rulesets: {
      pullRequest: {
        sharedRequiredApprovingReviewCount: 1,
      },
    },
  },
}
```

Require reviews only for production:

```ts
github: {
  repository: {
    rulesets: {
      pullRequest: {
        sharedRequiredApprovingReviewCount: 0,
        productionRequiredApprovingReviewCount: 1,
      },
    },
  },
}
```

Disable ruleset sync:

```ts
github: {
  sync: {
    applyRulesets: false,
  },
}
```

### Merge methods (GitHub UI + rulesets)

Default policy enables **squash** and **merge commits** on the repo and allows **`pullRequest.allowedMergeMethods: ["squash", "merge"]`** (rebase stays off) — see **`packages/alchemy-utils/src/github-policy-config.ts`**. After **`bun run github:sync:staging`** updates settings and rulesets, you should see **both** options (dropdown or separate actions). If rulesets are skipped on your plan (**403**), set merge button options once under **Settings → General** to match, or override in **`config/github.policy.ts`**.

### PR preview CI: `GitHub repository not found` (Alchemy)

The stock **`apps/web/alchemy.run.ts`** does **not** use **`alchemy/github`** (no `GitHubComment` / `RepositoryEnvironment` here). Preview links are handled by **`pr-preview-comment.yml`**. If you add **`GitHubComment`** (or similar) in this file, **do not** run it for **`CI` + `STAGE=pr-*`** unless you skip **`verifyGitHubAuth`** — fork/private **`pull_request`** runs often get **404** from **`repos.get`** with **`GITHUB_TOKEN`**.

If **`deploy:preview`** still fails in **`verifyGitHubAuth`**, some **other** package in the deploy graph provisions GitHub resources with a bad **`owner`/`repository`**.
## Useful Commands

```bash
# Print setup guidance
bun run github:setup

# Full sync for one stage
bun run github:sync:staging
bun run github:sync:prod

# Full sync for both stages
bun run github:sync

# Only update GitHub Environment deployment protection
bun run github:env:staging
bun run github:env:prod

# Config-only sync: repo settings/rulesets/Environment shells, no secret upload
bun run github:sync:config
```

## Required Permissions

The GitHub token used by `gh` needs admin access to the repository for rulesets, repo settings, repo variables, and Environment protection.

GitHub ruleset feature availability can vary by account/plan. If a ruleset option fails with a GitHub API validation error, simplify the policy first and rerun `github:sync:staging`.

On **private repositories**, GitHub may refuse **rulesets** (**403** — e.g. upgrade to Pro or make the repo **public**) or **Environment** protection fields (**422** — e.g. wait timers on plans that disallow them, **`prevent_self_review`** without reviewers, or **required reviewers** on **`staging-fork`**). Sync logs **`githubRepoRulesetsSkipped`** when rulesets cannot be applied and **`githubRepositoryEnvironmentSkipped`** when **`RepositoryEnvironment`** updates fail; both are **best-effort** so secrets and variables still sync. Keep **`waitTimerMinutes: 0`** in **`config/github.policy.ts`** for **`staging`** / **`production`** / **`stagingFork`** unless your plan supports wait timers; **`github:sync:*`** omits **`wait_timer`** and omits **`prevent_self_review`** unless it is **true** and at least one reviewer is configured. **`staging-fork`** defaults with **`reviewerFallbackToActor: false`** so sync does not inject a synthetic required reviewer (Free/private friendly); on Team/Enterprise, set **`reviewerFallbackToActor: true`** or explicit **`reviewerUsers`** / **`reviewerTeams`** in **`github.environments.stagingFork`** if you want fork PR deploy approvals.
