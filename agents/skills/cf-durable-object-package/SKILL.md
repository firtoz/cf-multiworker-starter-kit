---
name: cf-durable-object-package
description: Add or change a Durable Object worker package under durable-objects/ (Alchemy, env.d.ts, Hono on the DO). Use when scaffolding with turbo gen durable-object, editing durable-objects/*/alchemy.run.ts, workers/app.ts, or env.d.ts for a DO. Not for web app bindings or cross-worker rpc—see cf-web-alchemy-bindings and cf-worker-rpc-turbo.
---

# Durable Object package (Alchemy + Hono)

## When to use

- New package under `durable-objects/<name>/` (generator or copy an example).
- Changing `DurableObjectNamespace`, `Worker`, entrypoint, or the DO’s Hono app.

## Steps

1. **Package layout**

   Minimum files: **`alchemy.run.ts`**, **`env.d.ts`**, **`workers/app.ts`**, **`package.json`** (**`exports`**: **`"./alchemy": "./alchemy.run.ts"`**), **`tsconfig.json`**.

   Examples: [ping-do](../../../durable-objects/ping-do) (Hono + DO + WorkerEntrypoint), [chatroom-do](../../../durable-objects/chatroom-do) (Socka + DO SQLite + [chat-contract](../../../packages/chat-contract)).

   For **WebSocket RPC + server push**, prefer **Socka + contract** over ad hoc **`WebSocket`** JSON — [cf-socka-realtime](../cf-socka-realtime/SKILL.md).

2. **`alchemy.run.ts`**

   - **`await alchemy(…)`** string must match **`alchemy-cli.ts`** / **`${PRODUCT_PREFIX}-<suffix>`** (**`PRODUCT_PREFIX`** + **`ALCHEMY_APP_IDS`** → **`alchemy-utils/worker-peer-scripts`**).
   - **`requireAlchemyPassword(app)`** from **`alchemy-utils`**.
   - Export **`DurableObjectNamespace<YourDoRpc>`** (types from **`./workers/rpc`**).
   - **`Worker(...)`**: use **`DEFAULT_WORKER_RESOURCE_ID`** (**`worker`**); omit **`name:`** unless you need an override. Cyclic **`WorkerRef`** pairs: **`omitDefaultPhysicalWorkerScriptName`** ([cf-worker-rpc-turbo](../cf-worker-rpc-turbo/SKILL.md)).

3. **SQLite / Drizzle (persisted DO state)**

   - Source of truth: package **`src/schema.ts`**.
   - **`drizzle.config.ts`**: **`dialect: "sqlite"`**, **`driver: "durable-sqlite"`**, schema → that file.
   - **`package.json`**: **`"db:generate": "drizzle-kit generate"`**; run it → **`drizzle/*.sql`**, **`drizzle/meta/*.json`**, **`drizzle/migrations.js`**.
   - **`drizzle/sql.d.ts`**: **`declare module "*.sql"`**; **`tsconfig`** includes **`drizzle/**/*.d.ts`** for SQL imports.
   - **Never** hand-edit Drizzle SQL or meta; commit only generator output.

4. **`env.d.ts`** — `export type CloudflareEnv = (typeof <yourExportedWorker>)["Env"]`. `declare global { type Env = CloudflareEnv }` and `declare module "cloudflare:workers"` `Env` merge (match [ping-do/env.d.ts](../../../durable-objects/ping-do/env.d.ts)).

5. **Hono** — In `workers/app.ts`: `import type { CloudflareEnv } from "../env"`, `const app = new Hono<{ Bindings: CloudflareEnv }>()` (same as [other-worker/workers/app.ts](../../../durable-objects/other-worker/workers/app.ts)).

6. **Scripts**

   - **`dev`**: **`bunx dotenv-cli -v STAGE=local -e ../../.env.local -- bun ../../packages/alchemy-utils/src/alchemy-cli.ts dev <kebab-suffix>`** → **`alchemy dev --app ${PRODUCT_PREFIX}-<suffix>`**.
   - **`deploy` / `destroy`**: same **`dotenv-cli`** + **`alchemy-cli`** pattern for each stage.
   - Add **`state-hub`**: **`workspace:*`** **`devDependency`** so Turbo **`^deploy:*`** runs the shared CI state hub first.
   - SQLite DOs: also expose **`db:generate`**.

7. **After edits** — From repo root: `bun run typegen` and `bun run typecheck` (or package-local `typecheck:local`). If schema changed, run package-local `db:generate` first.

## Next (outside this skill)

- Wire the web app: [cf-web-alchemy-bindings](../cf-web-alchemy-bindings/SKILL.md).
- `workers/rpc.ts`, `WorkerRef`, root `dev` / `destroy:*`: [cf-worker-rpc-turbo](../cf-worker-rpc-turbo/SKILL.md).

## Optional web / WebSocket checklist

If this new DO should be reachable from the web app, complete these follow-up edits:

1. Root `package.json` `dev`: add `--filter=<your-package>`.
2. Root `turbo.json`: add `<your-package>#destroy:prod`, `#destroy:staging`, and `#destroy:preview` depending on the matching **`@internal/web#destroy:*`**.
3. `apps/web/package.json`: add `"<your-package>": "workspace:*"` and run `bun install`.
4. `apps/web/alchemy.run.ts`: import from `"<your-package>/alchemy"` and bind the namespace/worker into `ReactRouter`.
5. **WebSocket / Socka**

   - In **`apps/web/workers/app.ts`**: upgrades **before** React Router; same URL prefix as client; skip Vite HMR; forward to DO **`/websocket`**.
   - **`@firtoz/socka`**: [cf-socka-realtime/SKILL.md](../cf-socka-realtime/SKILL.md) — contract, **`SockaWebSocketDO`**, **`useSockaSession`**, SSR-safe **`wss://`**.

6. Verify from repo root: `bun run typegen`, `bun run typecheck`, `bun run lint`.
