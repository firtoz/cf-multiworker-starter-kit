import { defineConfig } from "drizzle-kit";

/** D1: generate SQL with `bun run db:generate`; `@internal/db` Alchemy app applies migrations on deploy. */
export default defineConfig({
	schema: "./src/schema.ts",
	out: "./drizzle",
	dialect: "sqlite",
	driver: "d1-http",
});
