# GitHub Admin Sync

This repo can set up GitHub Actions Environments, secrets, variables, repo merge settings, and branch rulesets from a trusted local machine.

Most forks only need:

```bash
bun run onboard:staging
bun run onboard:prod
```

Use this page when you want to change how GitHub behaves after onboarding.

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
- Requires the `Production merge source` status check, which is produced by [`restrict-production-pr-source.yml`](../.github/workflows/restrict-production-pr-source.yml).
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
