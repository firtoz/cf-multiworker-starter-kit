/**
 * Short copy injected into **`bun run setup`** flow for staging / prod dotfiles (see **`setup-env.ts`**).
 */
export const GITHUB_POLICY_HINT_LINES = [
	"",
	"**GitHub policy:** deployment protection, fork **`staging-fork`** rules, merge buttons, and repository rulesets are set in **`config/github.policy.ts`** (TypeScript, versioned). Run **`bun run typecheck:root`** after editing.",
	"**`bun run github:env:*`** applies **`RepositoryEnvironment`** protection from that file — stage dotfile is optional when you only need policy; **`github:sync:*`** still uses **`.env.staging`** / **`.env.production`** for real secrets.",
	"**Fork PR previews** use Environment **`staging-fork`**; reviewer fallback for empty lists is controlled by **`github.environments.stagingFork.reviewerFallbackToActor`** in the policy file.",
] as const;
