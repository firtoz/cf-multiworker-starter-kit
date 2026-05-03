import alchemy from "alchemy";
import { D1Database } from "alchemy/cloudflare";
import { requireAlchemyPassword } from "alchemy-utils";
import { alchemyCiCloudStateStoreOptions } from "alchemy-utils/alchemy-cloud-state-store";
import { resolveStageFromEnv } from "alchemy-utils/deployment-stage";
import {
	ALCHEMY_APP_IDS,
	DEFAULT_D1_DATABASE_RESOURCE_ID,
} from "alchemy-utils/worker-peer-scripts";

const stage = resolveStageFromEnv();
const app = await alchemy(ALCHEMY_APP_IDS.database, {
	stage,
	...alchemyCiCloudStateStoreOptions(stage),
});
requireAlchemyPassword(app);

export const mainDb = await D1Database(DEFAULT_D1_DATABASE_RESOURCE_ID, {
	adopt: true,
	migrationsDir: new URL("./drizzle", import.meta.url).pathname,
});

console.log({ app: ALCHEMY_APP_IDS.database, d1: mainDb.name });

await app.finalize();
