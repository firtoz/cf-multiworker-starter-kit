/**
 * Whether this deploy was built on **CI** vs a **developer machine** — drives PostHog **`--release-name`**
 * / bindings so laptop **`deploy:staging`** / **`deploy:prod`** do not share symbol sets with GitHub Actions.
 *
 * **Order**
 * 1. **`POSTHOG_DEPLOY_SOURCE`** — `ci` or `local` (escape hatch; rarely needed).
 * 2. **`GITHUB_ACTIONS=true`** — GitHub-hosted runners.
 * 3. **`CI=true`** — other CI (set by many providers); if you run deploys with `CI=true` locally, set **`POSTHOG_DEPLOY_SOURCE=local`**.
 * 4. Otherwise **`local`**.
 */
export type PosthogDeploySource = "ci" | "local";

export function resolvePosthogDeploySource(
	env: NodeJS.ProcessEnv = process.env,
): PosthogDeploySource {
	const explicit = env["POSTHOG_DEPLOY_SOURCE"]?.trim().toLowerCase();
	if (explicit === "local") {
		return "local";
	}
	if (explicit === "ci") {
		return "ci";
	}
	if (env["GITHUB_ACTIONS"]?.trim().toLowerCase() === "true") {
		return "ci";
	}
	if (env["CI"]?.trim().toLowerCase() === "true") {
		return "ci";
	}
	return "local";
}
