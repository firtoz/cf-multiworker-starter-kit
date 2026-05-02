/**
 * **`cf-starter-web`** emits the deployed **`workers.dev`** URL here during GitHub Actions
 * (**`GITHUB_ACTIONS`**, **`GITHUB_WORKSPACE`** repo root).
 *
 * **`.alchemy/`** is repo-**gitignored** — this never shows up as an untracked path for normal tooling.
 *
 * Deploy workflows (`deploy-*.yml`) **read this same path**; keep paths in sync after changing this constant.
 */
export const CF_STARTER_CI_WEB_DEPLOY_URL_RELPATH =
	".alchemy/ci/cf-starter-web-deploy-url.txt" as const;
