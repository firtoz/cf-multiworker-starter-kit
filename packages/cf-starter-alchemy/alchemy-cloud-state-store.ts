/**
 * Persist Alchemy deploy state outside the ephemeral CI filesystem.
 *
 * - **CI** (`CI=true`): [`CloudflareStateStore`](https://alchemy.run/guides/cloudflare-state-store) with a per-stage worker name (`ALCHEMY_STATE_TOKEN` secret).
 * - **Local** (no CI): omit — stays on the repo `.alchemy/` directory.
 */
import type { Scope } from "alchemy";
import { CloudflareStateStore } from "alchemy/state";

/** CF Worker script segment: lowercase alphanumeric + hyphen, max-ish safe length */
export function sanitizeAlchemyStateStoreStageSlug(stage: string): string {
	const s = stage
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	const slug = (s || "stage").slice(0, 48);
	return slug.length > 0 ? slug : "stage";
}

/**
 * Spread into {@link import("alchemy").default} App options beside `stage` when creating an app:
 * `{ stage: '…', ...alchemyCiCloudStateStoreOptions(stage) }`
 */
export function alchemyCiCloudStateStoreOptions(stage: string): {
	stateStore?: (scope: Scope) => CloudflareStateStore;
} {
	if (process.env["CI"] !== "true") {
		return {};
	}
	const slug = sanitizeAlchemyStateStoreStageSlug(stage);
	return {
		stateStore: (scope) =>
			new CloudflareStateStore(scope, {
				scriptName: `cf-starter-alchemy-state-${slug}`,
			}),
	};
}
