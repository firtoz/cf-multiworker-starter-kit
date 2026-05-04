/**
 * **GitHub repo + Environment policy** — versioned, reviewable config (not dotenv).
 *
 * - **Secrets** stay in `.env.local` / `.env.staging` / `.env.production`.
 * - **This file** drives deployment protection, merge-button settings, **repository rulesets**
 *   (branch/PR rules — `production` need not exist yet), and Environment rules
 *   when you run `bun run github:sync:staging`, `github:env:*`, etc.
 *
 * Start from the defaults below; change fields as needed. Run `bun run typecheck` after edits.
 */
import type { GitHubPolicyConfig } from "../packages/alchemy-utils/src/github-policy-config";
import { DEFAULT_GITHUB_POLICY } from "../packages/alchemy-utils/src/github-policy-config";

export default DEFAULT_GITHUB_POLICY satisfies GitHubPolicyConfig;
