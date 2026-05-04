/**
 * Persist Alchemy deploy state in Cloudflare for every non-local stage so **CI and developer laptops**
 * share deployment state (`deploy:*`, `destroy:*`). Local dev skips this and uses the default filesystem store.
 *
 * - **`STAGE !== "local"`** (staging, prod, PR preview, etc.): [`CloudflareStateStore`](https://alchemy.run/guides/cloudflare-state-store)
 *   with one **`${PRODUCT_PREFIX}-alchemy-state-${stageSlug}`** script per stage (`ALCHEMY_STATE_TOKEN`).
 * - **`STAGE=local`** (`alchemy dev`): omit — repo **`.alchemy/`** directory (default).
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
 *
 * Remote state for all stages except **`local`**; name kept for historical call sites.
 */
export function alchemyCiCloudStateStoreOptions(stage: string): {
	stateStore?: StateStoreType;
} {
	if (stage.trim().toLowerCase() === "local") {
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
