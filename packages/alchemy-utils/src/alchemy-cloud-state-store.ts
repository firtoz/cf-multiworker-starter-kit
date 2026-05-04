/**
 * Persist Alchemy deploy state in Cloudflare for every non-local stage so **CI and developer laptops**
 * share deployment state (`deploy:*`, `destroy:*`). Local dev skips this and uses the default filesystem store.
 *
 * - **`STAGE !== "local"`** (staging, prod, PR preview, etc.): [`CloudflareStateStore`](https://alchemy.run/guides/cloudflare-state-store)
 *   without a custom `scriptName`, so Alchemy uses the account default **`alchemy-state-service`** (`ALCHEMY_STATE_TOKEN`).
 *   Stacks stay isolated by **app id** (`alchemy("…")`) and **`stage`** inside that store — not one state-store Worker per stage.
 * - **`STAGE=local`** (`alchemy dev`): omit — repo **`.alchemy/`** directory (default).
 *
 * **Concurrency:** Each deploy package lists **`state-hub`** as a **`devDependency`** and **`deploy:*`** uses **`dependsOn`** **`^deploy:*`** so the hub runs before siblings and two
 * processes never compete to create the same Durable Object namespace ([10065 … already in use](https://developers.cloudflare.com/workers/configuration/durable-objects/)).
 *
 * Keep a single workspace-hoisted `alchemy` install so `Scope` / `StateStoreType` stays consistent across packages.
 */
import type { StateStoreType } from "alchemy";
import { CloudflareStateStore } from "alchemy/state";

/**
 * Spread into {@link import("alchemy").default} App options beside `stage`:
 * `{ stage, ...alchemyCiCloudStateStoreOptions(stage) }`
 *
 * Remote state for all stages except **`local`**.
 */
export function alchemyCiCloudStateStoreOptions(stage: string): {
	stateStore?: StateStoreType;
} {
	if (stage.trim().toLowerCase() === "local") {
		return {};
	}
	return {
		stateStore: (scope) => new CloudflareStateStore(scope),
	};
}
