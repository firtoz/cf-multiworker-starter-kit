/**
 * The web app writes its deployed **`workers.dev`** URL here during GitHub Actions
 * (**`GITHUB_ACTIONS`**, **`GITHUB_WORKSPACE`** repo root).
 *
 * **`.alchemy/`** is repo-**gitignored** — this never shows up as an untracked path for normal tooling.
 *
 * Deploy workflows **read this same path**; keep paths in sync with this constant.
 */
export const CI_WEB_DEPLOY_URL_RELPATH = ".alchemy/ci/web-deploy-url.txt" as const;
