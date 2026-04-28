import alchemy from "alchemy";
import { D1Database } from "alchemy/cloudflare";
import { requireAlchemyPassword } from "cf-starter-alchemy";

const app = await alchemy("cf-starter-db");
requireAlchemyPassword(app);

export const mainDb = await D1Database("main-db", {
	adopt: true,
	migrationsDir: new URL("./drizzle", import.meta.url).pathname,
});

console.log({ app: "cf-starter-db", d1: mainDb.name });

await app.finalize();
