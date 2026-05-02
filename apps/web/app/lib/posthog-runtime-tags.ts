/** Optional PostHog: super properties registered on init (every capture inherits these). */
export type PostHogRuntimeTags = {
	/** Alchemy deploy slug: `prod`, `staging`, `local`, `pr-<n>`. */
	deploy_stage: string;
	/** PR number when **`deploy_stage`** is **`pr-<n>`**; otherwise null. */
	preview_pr_number: number | null;
	/** Maps to **`logs.environment`** → OTel `deployment.environment` when PostHog Logs flush. */
	deployment_environment: string;
};
