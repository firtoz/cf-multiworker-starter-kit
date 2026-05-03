/**
 * Short copy injected into **`bun run setup`** flow for staging / prod dotfiles (see **`setup-env.ts`**).
 */
export const GITHUB_POLICY_HINT_LINES = [
	"",
	"**GitHub policy:** deployment protection, fork **`staging-fork`** rules, merge buttons, and repository rulesets are set in **`config/github.policy.ts`** (TypeScript, versioned). Run **`bun run typecheck:root`** after editing.",
	"**`bun run github:env:*`** applies **`RepositoryEnvironment`** protection from that file — stage dotfile is optional when you only need policy; **`github:sync:*`** still uses **`.env.staging`** / **`.env.production`** for real secrets.",
	"**Fork PRs** run Quality only in the stock workflows and do not receive deploy secrets. **`staging-fork`** remains in policy/sync for legacy or future preview workflows; **`reviewerFallbackToActor`** defaults to **auto**, which injects the **`gh`** login when reviewer lists are empty on **public**/**internal** repos; **private** skips unless **`GITHUB_SYNC_STAGING_FORK_REVIEWERS_PRIVATE=1`** or policy **`true`** / explicit reviewers.",
] as const;
