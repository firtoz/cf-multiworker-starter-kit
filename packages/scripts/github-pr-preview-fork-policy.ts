/**
 * Fork PR preview gate — read by **`.github/workflows/deploy-pr-preview.yml`** as **`vars.CF_STARTER_ALLOW_PREVIEW_FOR_FORK_PRS`**.
 *
 * Set as a **repository** Actions variable (Settings → Secrets and variables → Actions → Variables),
 * **not** on the `staging` Environment — the gate job has no `environment:` and cannot read Environment variables.
 */
export const CF_STARTER_ALLOW_PREVIEW_FOR_FORK_PRS_VAR = "CF_STARTER_ALLOW_PREVIEW_FOR_FORK_PRS" as const;
