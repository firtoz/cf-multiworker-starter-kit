---
name: cf-durable-object-package
description: Add or change a Durable Object worker package under durable-objects/ (Alchemy, env.d.ts, Hono on the DO). Use when scaffolding with turbo gen durable-object, editing durable-objects/*/alchemy.run.ts, workers/app.ts, or env.d.ts for a DO. Not for web app bindings or cross-worker rpc—see cf-web-alchemy-bindings and cf-worker-rpc-turbo.
---

# Durable Object package (Alchemy + Hono)

## When to use

- New package under `durable-objects/<name>/` (generator or copy an example).
- Changing `DurableObjectNamespace`, `Worker`, entrypoint, or the DO’s Hono app.

## Steps

1. **Package layout** — At minimum: `alchemy.run.ts`, `env.d.ts`, `workers/app.ts`, `package.json` with `"exports": { "./alchemy": "./alchemy.run.ts" }`, `tsconfig.json`. Reference: [durable-objects/ping-do](durable-objects/ping-do) (Hono + DO + WorkerEntrypoint) or [durable-objects/chatroom-do](durable-objects/chatroom-do) (Socka + DO SQLite, shared contract in [packages/chat-contract](../../../packages/chat-contract)). For **WebSocket RPC + server push** on a DO, prefer that Socka + contract pattern over raw `WebSocket` JSON; full playbook: [cf-socka-realtime/SKILL.md](../cf-socka-realtime/SKILL.md).

2. **`alchemy.run.ts`** — `const app = await alchemy(...)`, **`--app`** in scripts **must equal** this string (`CF_STARTER_APPS.<role>` starter pattern lives in **`cf-starter-alchemy/worker-peer-scripts`**). Then `requireAlchemyPassword(app)` with `import { requireAlchemyPassword } from "cf-starter-alchemy"`. Export `DurableObjectNamespace<YourDoRpc>` (type from `./workers/rpc`). Use **`DEFAULT_WORKER_RESOURCE_ID`** (**`worker`**) in **`Worker(...)`**, omit **`name:`** unless you need an override — peer **`WorkerRef.service`** aligns via **`omitDefaultPhysicalWorkerScriptName`** in cf-worker-rpc-turbo cyclic pair cases.

3. **SQLite / Drizzle (if this DO persists data)** — Source of truth is package-local `src/schema.ts`. Add `drizzle.config.ts` pointing at that schema with `dialect: "sqlite"` and `driver: "durable-sqlite"`, add package-local `"db:generate": "drizzle-kit generate"`, and run that script to create `drizzle/*.sql`, `drizzle/meta/*.json`, and Drizzle's `drizzle/migrations.js` runtime wrapper. Add `drizzle/sql.d.ts` (`declare module "*.sql"`) and include `drizzle/**/*.d.ts` so the generated SQL imports typecheck. **Never hand-author or edit Drizzle SQL or meta snapshots.** Commit generated output only after it came from Drizzle.

4. **`env.d.ts`** — `export type CloudflareEnv = (typeof <yourExportedWorker>)["Env"]`. `declare global { type Env = CloudflareEnv }` and `declare module "cloudflare:workers"` `Env` merge (match [durable-objects/ping-do/env.d.ts](durable-objects/ping-do/env.d.ts)).

5. **Hono** — In `workers/app.ts`: `import type { CloudflareEnv } from "../env"`, `const app = new Hono<{ Bindings: CloudflareEnv }>()` (same as [durable-objects/other-worker/workers/app.ts](durable-objects/other-worker/workers/app.ts)).

6. **Scripts** — Prefer `cross-env STAGE=local … alchemy dev --app <kebab-id>` in `package.json` `dev` (not raw `wrangler dev` for this monorepo’s flow). Expose **`deploy:prod` / `deploy:staging` / `deploy:preview`** and **`destroy:*`** aligned with **`--app`** id. SQLite packages should also expose package-local `db:generate`.

7. **After edits** — From repo root: `bun run typegen` and `bun run typecheck` (or package-local `typecheck:local`). If schema changed, run package-local `db:generate` first.

## Next (outside this skill)

- Wire the web app: [cf-web-alchemy-bindings](../cf-web-alchemy-bindings/SKILL.md).
- `workers/rpc.ts`, `WorkerRef`, root `dev` / `destroy:*`: [cf-worker-rpc-turbo](../cf-worker-rpc-turbo/SKILL.md).

## Optional web / WebSocket checklist

If this new DO should be reachable from the web app, complete these follow-up edits:

1. Root `package.json` `dev`: add `--filter=<your-package>`.
2. Root `turbo.json`: add `<your-package>#destroy:prod`, `#destroy:staging`, and `#destroy:preview` depending on the matching **`cf-starter-web#destroy:*`**.
3. `apps/web/package.json`: add `"<your-package>": "workspace:*"` and run `bun install`.
4. `apps/web/alchemy.run.ts`: import from `"<your-package>/alchemy"` and bind the namespace/worker into `ReactRouter`.
5. **WebSocket / Socka:** handle the worker upgrade path in `apps/web/workers/app.ts` before React Router, keep the client URL prefix and worker handler prefix identical, avoid Vite HMR paths, and forward to the DO path `/websocket`. If using **`@firtoz/socka`**, align with [cf-socka-realtime/SKILL.md](../cf-socka-realtime/SKILL.md) (contract package, `SockaWebSocketDO`, `useSockaSession`, route-safe `wss://` from `window` in client-only code).
6. Verify from repo root: `bun run typegen`, `bun run typecheck`, `bun run lint`.
