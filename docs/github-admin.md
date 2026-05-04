# GitHub Admin Sync

This repo can set up GitHub Actions Environments, secrets, variables, repo merge settings, and branch rulesets from a trusted local machine.

**Typical setup** for this repository (and the same for a fork after you replace placeholders like `your-org`) usually comes down to:

```bash
bun run onboard:staging
bun run onboard:prod
```

Use this page when you want to change how GitHub behaves after onboarding.

## CI and deploy workflows

- **Until deploy is enabled:** deploy jobs **no-op** until **`DEPLOY_ENABLED=true`** exists on each GitHub Environment that runs deploys (**`staging`**, **`production`**; optional **`staging-fork`** remains in policy/sync for legacy or future use — **fork PRs no longer run preview deploy**). That applies to **this** repo’s GitHub Environments as well as any fork’s. Running **`bun run onboard:staging`** / **`onboard:prod`** (or **`github:sync:*`**) syncs secrets/variables and typically sets this.
- **Quality reusable** (`.github/workflows/quality-reusable.yml`): parallel jobs — Drizzle generated-artifact guard, lint, **`typegen`** + typecheck, **`bun run setup -- --yes`** + build. Invoked by **`Main`** (push **`main`**) and **`PR preview`** (open/sync/reopen on **`main`**).
- **Main** (`.github/workflows/main-push.yml`): **push** **`main`** → Quality → caller-level **Quality checks** gate → **staging** deploy (`maybe_production_pr` when **`AUTO_PRODUCTION_PR`**). Uses Environment **`staging`**.
- **Production deploy** (`.github/workflows/prod-deploy.yml`): **push** **`production`** or **`workflow_dispatch`** when the selected ref is **`production`**.
- **PR previews** (`.github/workflows/pr-deploy.yml`): **same-repo** PRs run Quality in this workflow, then preview deploy to **`staging`** when **`DEPLOY_ENABLED`**; sticky PR comments and optional **`preview-pr-<n>`** GitHub Deployments. **Fork PRs** run **Quality only** (no preview deploy, no **`staging-fork`** preview path). Preview stacks use **`STAGE=pr-<n>`**. **Teardown** on **`pull_request` `closed`** (same-repo only): **`verify:deploy-env:preview`**, then **`destroy:preview`**; checks out the **base** branch so destroy does not run untrusted PR scripts. Alchemy state for all non-local stages lives in the shared account **`alchemy-state-service`** Worker — teardown does **not** delete it. **`alchemy destroy`** still loads **`alchemy.run.ts`** top-level **`requireEnv`** — mirror deploy **`env`** keys on **Destroy PR preview** when you add vars at module scope (see [**multiworker-gotchas** §22](../agents/skills/multiworker-gotchas/SKILL.md)).
- **Branch protection:** the **`main`** ruleset requires the caller-level **Quality checks** gate, not an inner job from the reusable workflow. Default required context: **`Quality checks`** in [`github-policy-config.ts`](../packages/alchemy-utils/src/github-policy-config.ts). GitHub's PR UI may display this as **`PR preview / Quality checks (pull_request)`**, but the ruleset picker stores the unprefixed check context. Keep this as a normal job in [`pr-deploy.yml`](../.github/workflows/pr-deploy.yml); requiring **`PR preview / Quality / Quality checks`** (inside **`quality-reusable.yml`**) can stay stuck as **Expected — Waiting for status** even when the check run is green.

### `ALCHEMY_STATE_TOKEN` (GitHub Environments)

Deploy workflows read **`ALCHEMY_STATE_TOKEN`** from the active GitHub Environment (**`staging`**, **`production`**). For the usual **one Cloudflare account** setup, that secret must be the **same value** on **`staging` and `production`** and must match repo-root **`.env.staging`** / **`.env.production`** when you deploy from a laptop. After editing dotfiles, run **`bun run github:sync:staging`** / **`github:sync:prod`** so CI stays aligned. A mismatch often fails with **`[CloudflareStateStore] The token is invalid`**. See [`agents/skills/cf-workers-env-local/SKILL.md`](../agents/skills/cf-workers-env-local/SKILL.md) (ground rules §3).

Use **`bun run github:setup`** for a step-by-step printout.

Onboarding wrappers (trusted machine, **`gh`** authenticated):

```bash
bun run github:setup
bun run onboard:staging
bun run onboard:prod
```

**`onboard:prod`** also sets repo variable **`AUTO_PRODUCTION_PR=true`**, after which a successful **staging** deploy may **open or reuse** a PR **`main` → `production`**. You still **merge** that PR to ship production (and remote **`production`** must exist). `bun run github:sync:staging` also enables the repository Actions workflow permission that lets **`GITHUB_TOKEN`** create the production PR; if GitHub rejects that setting, enable it at the **organization or enterprise** level, then rerun staging sync.

**Default repo policy** (see [`config/github.policy.ts`](../config/github.policy.ts)): **`main`** — PRs for writers, admins may bypass; **`production`** — PR from **`main`**, no admin bypass by default; approving review count defaults to **0** for solo maintainers.

### Upgrading deploy-control variable names

**This** repository’s workflows and sync scripts expect the generic names below. Older checkouts—including previous revisions of **this** template—may still use product-prefixed GitHub variable names. Rename and resync whether you maintain the template repo or a fork:

| Old name | New name |
| --- | --- |
| `MULTIWORKER_DEPLOY_ENABLED` | `DEPLOY_ENABLED` |
| `MULTIWORKER_AUTO_PRODUCTION_PR` | `AUTO_PRODUCTION_PR` |
| `MULTIWORKER_PRODUCTION_PR_HEAD` | `PRODUCTION_PR_HEAD` |

Update **this repo’s** local **`.env.staging`** / **`.env.production`** (or the same files on your machine) only if they still contain the old deploy gate:

```bash
# before
MULTIWORKER_DEPLOY_ENABLED=true

# after
DEPLOY_ENABLED=true
```

Then run **`bun run github:sync:staging`** and **`bun run github:sync:prod`** from a trusted machine. Sync writes **`DEPLOY_ENABLED`** to the GitHub Environments and **`PRODUCTION_PR_HEAD`** to repo variables. **`bun run onboard:prod`** or **`gh variable set AUTO_PRODUCTION_PR --body true`** writes the optional production-PR automation gate.

The sync does not delete old GitHub variables. You can remove stale **`MULTIWORKER_*`** variables after the new workflow names are synced and a run has succeeded.

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
bun run typecheck
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
- Requires the `Production merge source` status check, which is produced by [`restrict-production-pr-source.yml`](../.github/workflows/restrict-production-pr-source.yml) on **normal** `pull_request` events (humans / PAT-opened PRs). **PRs opened by Actions using `GITHUB_TOKEN` do not start other workflows**, so [`main-push.yml`](../.github/workflows/main-push.yml) also posts that check via the Checks API after it opens or reuses the **main → production** PR.
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

The stock **`apps/web/alchemy.run.ts`** does **not** use **`alchemy/github`** (no `GitHubComment` / `RepositoryEnvironment` here). Preview URLs are written to **`.alchemy/ci/web-deploy-url.txt`** and surfaced in **`pr-deploy.yml`** PR comments. If you add **`GitHubComment`** (or similar) in this file, **do not** run it for **`CI` + `STAGE=pr-*`** unless you skip **`verifyGitHubAuth`** — fork/private **`pull_request`** runs often get **404** from **`repos.get`** with **`GITHUB_TOKEN`**.

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

On **private repositories**, GitHub may refuse **rulesets** (**403** — e.g. upgrade to Pro or make the repo **public**) or **Environment** protection fields (**422** — e.g. wait timers on plans that disallow them, **`prevent_self_review`** without reviewers, or **required reviewers** on **`staging-fork`**). Sync logs **`githubRepoRulesetsSkipped`** when rulesets cannot be applied and **`githubRepositoryEnvironmentSkipped`** when **`RepositoryEnvironment`** updates fail; both are **best-effort** so secrets and variables still sync. Keep **`waitTimerMinutes: 0`** in **`config/github.policy.ts`** for **`staging`** / **`production`** / **`stagingFork`** unless your plan supports wait timers; **`github:sync:*`** omits **`wait_timer`** and omits **`prevent_self_review`** unless it is **true** and at least one reviewer is configured. **`staging-fork`** defaults with **`reviewerFallbackToActor: "auto"`**: **public** and **internal** repos inject the **`gh`** actor as required reviewer when user/team lists are empty; **private** repos skip that unless you set **`GITHUB_SYNC_STAGING_FORK_REVIEWERS_PRIVATE=1`** during sync (Team+/plans that allow Environment reviewers) or set **`reviewerFallbackToActor: true`** / explicit **`reviewerUsers`** / **`reviewerTeams`** in **`github.environments.stagingFork`**.
