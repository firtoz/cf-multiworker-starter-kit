import alchemy from "alchemy";
import { D1Database } from "alchemy/cloudflare";
import { requireAlchemyPassword } from "cf-starter-alchemy";
import { CF_STARTER_APPS, DEFAULT_D1_DATABASE_RESOURCE_ID } from "cf-starter-alchemy/worker-peer-scripts";

const app = await alchemy(CF_STARTER_APPS.database);
requireAlchemyPassword(app);

export const mainDb = await D1Database(DEFAULT_D1_DATABASE_RESOURCE_ID, {
	adopt: true,
	migrationsDir: new URL("./drizzle", import.meta.url).pathname,
});

console.log({ app: CF_STARTER_APPS.database, d1: mainDb.name });

await app.finalize();
