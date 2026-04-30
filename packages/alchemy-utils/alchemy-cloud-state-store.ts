/**
 * Persist Alchemy deploy state outside the ephemeral CI filesystem.
 *
 * - **CI** (`CI=true`): [`CloudflareStateStore`](https://alchemy.run/guides/cloudflare-state-store) with one
 *   **`${PRODUCT_PREFIX}-alchemy-state-${stageSlug}`** script per stage (`ALCHEMY_STATE_TOKEN`).
 * - **Local** (no CI): omit — repo **`.alchemy/`** directory.
 *
 * **Concurrency:** Each deploy package lists **`state-hub`** as a **`devDependency`** and **`deploy:*`** uses **`dependsOn`** **`^deploy:*`** so the hub runs before siblings and two
 * processes never compete to create the same Durable Object namespace ([10065 … already in use](https://developers.cloudflare.com/workers/configuration/durable-objects/)).
 *
 * Keep a single workspace-hoisted `alchemy` install so `Scope` / `StateStoreType` stays consistent across packages.
 */
import type { StateStoreType } from "alchemy";
import { CloudflareStateStore } from "alchemy/state";
import { PRODUCT_PREFIX } from "./worker-peer-scripts";

function sanitizeCfScriptSegment(segment: string, maxLen = 52): string {
	const s = segment
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	const slug = (s || "stage").slice(0, maxLen);
	return slug.length > 0 ? slug : "stage";
}

export function sanitizeAlchemyStateStoreStageSlug(stage: string): string {
	return sanitizeCfScriptSegment(stage, 48);
}

/**
 * Spread into {@link import("alchemy").default} App options beside `stage`:
 * `{ stage, ...alchemyCiCloudStateStoreOptions(stage) }`
 */
export function alchemyCiCloudStateStoreOptions(stage: string): {
	stateStore?: StateStoreType;
} {
	if (process.env["CI"] !== "true") {
		return {};
	}
	const stageSlug = sanitizeAlchemyStateStoreStageSlug(stage);
	return {
		stateStore: (scope) =>
			new CloudflareStateStore(scope, {
				scriptName: `${PRODUCT_PREFIX}-alchemy-state-${stageSlug}`,
			}),
	};
}
