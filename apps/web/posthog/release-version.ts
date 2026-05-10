import { execSync } from "node:child_process";

/**
 * PostHog **`--release-version`**: commit this deployment was built from (not set in dotfiles).
 *
 * **Resolution order**
 * 1. **`POSTHOG_RELEASE_VERSION`** — GitHub Actions deploy jobs set this to the commit being shipped
 *    (`github.sha` / PR **`head.sha`**). Avoids ambiguous **`GITHUB_SHA`** on `pull_request` and works without `.git`.
 * 2. **`git rev-parse HEAD`** — local **`alchemy deploy`** and CI when the repo is checked out.
 * 3. **`GITHUB_SHA`**, then a synthetic id.
 *
 * **CI vs laptop:** **`defaultPosthogReleaseName`** adds a **`-local`** suffix for non-CI deploys; **`resolvePosthogReleaseBuild`**
 * supplies **`local-<timestamp>`** so symbol uploads stay separate from GitHub Actions (see **`posthog/deploy-origin.ts`**).
 *
 * **Into `posthog.init`:** the base SHA is bound as **`POSTHOG_RELEASE_VERSION`**; when **`POSTHOG_RELEASE_BUILD`**
 * is set, **`posthogLogsServiceVersion`** packs **`version+build`** for **`logs.serviceVersion`**, matching PostHog’s
 * release metadata (same as **`posthog-cli`** combining version + `--build`).
 */
export function resolvePosthogReleaseVersion(env: NodeJS.ProcessEnv = process.env): string {
	const fromCi = env["POSTHOG_RELEASE_VERSION"]?.trim();
	if (fromCi) {
		return fromCi;
	}
	try {
		return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
	} catch {
		const gh = env["GITHUB_SHA"]?.trim();
		if (gh) {
			return gh;
		}
		return `build-${Date.now()}`;
	}
}

/**
 * **`logs.serviceVersion`** — PostHog treats **`+`** after the base version as **build** metadata (aligned with CLI **`--build`**).
 */
export function posthogLogsServiceVersion(baseVersion: string, build: string | undefined): string {
	const v = baseVersion.trim();
	const b = build?.trim();
	if (!v) {
		return "";
	}
	if (!b) {
		return v;
	}
	return `${v}+${b}`;
}
