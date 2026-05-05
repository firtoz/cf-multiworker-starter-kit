/**
 * Serializes provisioning of the shared [CloudflareStateStore](https://alchemy.run/guides/cloudflare-state-store)
 * worker for non-local stages (Turbo: **`^deploy`** on each app after listing **`state-hub`** as a **`devDependency`**).
 *
 * Contains no Workers/DO/D1 — **`finalize`** immediately after the Cloudflare state store attaches.
 */
import alchemy from "alchemy";
import { requireAlchemyPassword } from "alchemy-utils";
import { alchemyCiCloudStateStoreOptions } from "alchemy-utils/alchemy-cloud-state-store";
import { resolveStageFromEnv } from "alchemy-utils/deployment-stage";
import { ALCHEMY_APP_IDS } from "alchemy-utils/worker-peer-scripts";

const stage = resolveStageFromEnv();
const app = await alchemy(ALCHEMY_APP_IDS.stateHub, {
	stage,
	...alchemyCiCloudStateStoreOptions(stage),
});
requireAlchemyPassword(app);
await app.finalize();
