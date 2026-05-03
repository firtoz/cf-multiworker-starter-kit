---
name: multiworker-gotchas
description: Fork and template gotchas (env import, routes, typegen, forms, D1, Turbo, HMR, new DO packages). Use when working on apps/web or durable-objects, or when behavior diverges from this stack’s conventions.
---

# Cloudflare multi-worker — fork / template gotchas

These trip up new contributors and agents most often. For commands and checklists, see [multiworker-workflow](../multiworker-workflow/SKILL.md).

1. **Worker bindings and env** — Import the typed `env` from the Workers virtual module, not from React Router context: `import { env } from "cloudflare:workers"`. **Do not** use `context.cloudflare.env` (or similar) for Cloudflare bindings in this stack. More: [cf-workers-patterns.mdc](../../rules/cf-workers-patterns.mdc).

2. **Generated artifacts**
   - Never hand-author files meant to be generated.
   - **Drizzle:** edit **`packages/db/src/schema.ts`** or **`durable-objects/<name>/src/schema.ts`**; set **`drizzle.config.ts`** driver (**`d1-http`** vs **`durable-sqlite`**); run **`bun run db:generate`** or the package’s **`db:generate`**.
   - **Generated-only:** `drizzle/*.sql`, `drizzle/meta/*.json`, driver migration wrappers, React Router **`+types`**, lockfiles, **`.alchemy/`**. PRs should flag hand-written Drizzle output unless explicitly intentional.

3. **Route path export** — Each file under `apps/web/app/routes/` should export its path for `@firtoz/router-toolkit` (forms, typed submitters), matching `app/routes.ts` (`export const route: RoutePath<"/login"> = "/login";`). [routing/SKILL.md](../routing/SKILL.md).

4. **Regenerate types and verify often**
   - After routes, `alchemy.run.ts`, or env changes: **`bun run typegen`** (repo root), then **`bun run typecheck`** and **`bun run lint`** during the task—not only before a PR.
   - Prod bindings changed: **`turbo run typegen:prod`** then **`turbo run typecheck:prod`**. [multiworker-workflow](../multiworker-workflow/SKILL.md).
   - **`ALCHEMY_PASSWORD`** and **`CHATROOM_INTERNAL_SECRET`** have no in-repo defaults. **`bun run setup`** / **`setup:local`** → variable browser (TTY). **`bun run setup -- --yes`** or **`CI=true`** → auto-fill **only** regeneratable secrets into **`.env.local`**. **`setup:staging`** / **`setup:prod`** → stage dotfiles (copy from **`.env.local`** offered in the browser).

5. **Loaders and actions return `Promise<MaybeError<...>>`**
   - Import **`success`** / **`fail`** / **`MaybeError`** from **`@firtoz/maybe-error`** (not from **`@firtoz/router-toolkit`**).
   - Loaders: annotate return type; narrow with **`loaderData.success`**. Actions: prefer **`formAction`**. [form-submissions](../form-submissions/SKILL.md), [routing](../routing/SKILL.md).

6. **Index route + `formAction` / `useDynamicSubmitter` → 405**
   - **In-app:** use `formAction`, `useDynamicSubmitter`, `await submitter.submitJson(...)`, and exported route paths.
   - **Outside the router** (curl, plain HTML, tools): POSTs to an **index** route must use **`/?index`**; POST **`/`** alone will not hit the index **action**.
   - Prefer a **non-index** resource route for public create/join APIs.

7. **Export `formSchema`** (and related router-toolkit exports) for typed submitters when you use them. [form-submissions/SKILL.md](../form-submissions/SKILL.md).

8. **Alchemy + D1**
   - [packages/db/alchemy.run.ts](../../../packages/db/alchemy.run.ts) (**`ALCHEMY_APP_IDS.database`**, package **`@internal/db`**) defines **`D1Database`** with **`migrationsDir`** → **`packages/db/drizzle`**.
   - [apps/web/alchemy.run.ts](../../../apps/web/alchemy.run.ts) imports **`mainDb`** from **`@internal/db/alchemy`**.
   - Alchemy applies SQL on deploy/dev per [D1 + Drizzle](https://alchemy.run/guides/drizzle-d1/).
   - Do **not** hand-manage **`D1_DATABASE_ID`** for the default flow; do **not** add runtime **`CREATE TABLE`** fallbacks in loaders/actions—fix schema / migrations / local state instead.

9. **Turbo / stale `typegen`** — If route types look wrong, run `turbo run typegen:local --force` (or `typegen:prod` after env changes). [turborepo/SKILL.md](../turborepo/SKILL.md).

10. **JSDoc** — Do not use `*/` inside a `/** ... */` block (it ends the comment early). General TypeScript gotcha.

11. **Empty or stale local D1**
   1. **`bun run db:generate`** after schema changes.
   2. **`bun run dev`** (repo root) so **`@internal/db`** + web apply **`packages/db/drizzle`**.
   3. Still **`no such table`?** Confirm migration output, **`D1Database.migrationsDir`** still **`packages/db/drizzle`**, restart dev; only then consider resetting **local** Alchemy/D1 state (documented troubleshooting—not routine).

12. **Biome `check --write`** — Can modify files after you think you are done; re-run `bun run lint` or review the diff before finishing.

13. **Dev server port**
   - Vite may use **5174+** if **5173** is busy—don’t assume a fixed port when testing in a browser.
   - **Do not** pin **`server.hmr.port`**: client + SSR each run an HMR WebSocket server.
   - **`@cloudflare/vite-plugin`** ignores Vite HMR (**`sec-websocket-protocol: vite…`**) and forwards other **`/api/ws/*`** upgrades to Miniflare.

14. **Prod D1 / visitors errors** — If `/visitors` fails after deploy, confirm **`bun run deploy:prod`** (or **`packages/alchemy-utils/src/alchemy-cli.ts deploy database`** with the same **`STAGE`**) completed and D1 migrations ran; see [Alchemy D1Database](https://alchemy.run/providers/cloudflare/d1-database/).

15. **New Durable Object / worker package**
   - **Typing:** `import type { CloudflareEnv }` and `new Hono<{ Bindings: CloudflareEnv }>()` so **`c.env`** is typed.
   - **RPC types:** `workers/rpc.ts` (no `import` from `../env` there). Add **`package.json#exports`** **`"./workers/rpc"`** when consumers need it.
   - **`WorkerRef` / cross-worker:** one direction uses **`workspace:*`**; the other uses a relative **`../<pkg>/workers/rpc`** import to avoid Turbo cycles.
   - **New Alchemy app:** root [package.json](../../../package.json) **`dev`** filter.
   - **Destroy graph:** [turbo.json](../../../turbo.json) **`<pkg>#destroy:*`** with **`dependsOn`** **→** matching **`@internal/web#destroy:*`**.
   - **Wire web:** **`apps/web`** workspace dep; [apps/web/alchemy.run.ts](../../../apps/web/alchemy.run.ts) binding; [apps/web/workers/app.ts](../../../apps/web/workers/app.ts) forwarder if WebSockets.
   - **DO SQLite:** `src/schema.ts`, **`drizzle.config.ts`** with **`driver: "durable-sqlite"`**, package **`db:generate`**; never hand-edit generated migrations.
   - **Do not** add another package’s **`workers/app.ts`** to [tsconfig.cloudflare.json](../../../apps/web/tsconfig.cloudflare.json) **`include`**—it can break web **`Env`**.
   - Step-by-step: [cf-durable-object-package](../cf-durable-object-package/SKILL.md), [cf-web-alchemy-bindings](../cf-web-alchemy-bindings/SKILL.md), [cf-worker-rpc-turbo](../cf-worker-rpc-turbo/SKILL.md).

16. **WebSocket forwarding**
   - Handle Worker **upgrade** paths **before** React Router.
   - Keep **client URL prefix** and **worker route prefix** the same (e.g. **`/api/my-feature/ws/`**).
   - Don’t break **Vite HMR** WebSockets; forward the DO subpath to **`/websocket`** on the DO.
   - **Socka** RPC + push: [cf-socka-realtime](../cf-socka-realtime/SKILL.md) + **`@firtoz/socka`** (`chatroom-do`, **`packages/chat-contract`**). Avoid hand-rolled JSON wire protocols unless the user wants raw WS.

17. **SSR / browser boundary** — Routes run on the **server** first.
   - **Never** in module scope, loaders/actions, render, or SSR **`useMemo`:** `window`, `document`, `WebSocket`, `canvas`, `localStorage`, other DOM APIs.
   - **OK:** `useEffect`, handlers, **`ClientOnly`**, guarded client-only code.
   - WebSocket URL helpers may use **`window.location`** only when called from **client-only** code—or pass **`origin`** in.
   - **No** **`localhost` / `127.0.0.1`** / placeholder WS URLs as **runtime** defaults.

18. **Durable Object RPC `using` in local dev**
   - Real DO responses may be **`using`**-compatible; Vite SSR / some Miniflare paths return plain **`Response`**.
   - If **`using res = await api.get(…)`** throws **`Symbol.dispose`** errors → use **`const res = …`** or guard disposers.
   - **`using api = honoDoFetcherWithName(…)`** is usually safer (library guards missing stubs).

19. **Alchemy dev stale web process state**
   - Symptom: log shows **`webUrl`** for **5173** but the port is dead after a crash.
   - Delete **`.alchemy/pids/`** entry for the web workspace package (slug from **`apps/web/package.json`** `name`, e.g. `@internal-web` or scoped form depending on Alchemy) and the matching **`.alchemy/web/local/`** JSON. 
   - Ensure the web package log file under **`.alchemy/logs/`** exists (empty file is fine), then **`bun run dev`**. Never commit **`.alchemy/`**.

20. **`CLOUDFLARE_API_TOKEN` vs `CLOUDFLARE_ACCOUNT_ID`**
   - Must be **one** Cloudflare account—swapped or mismatched values → **`[CloudflareStateStore]`** **404** **`text/html`**, wrong **`workers.dev`** subdomain, confusing deploy failures.
   - Align dashboard **Account ID**, token **Account Resources**, and **`.env.staging`** / **`.env.production`**.
   - On GitHub: **`CLOUDFLARE_ACCOUNT_ID`** = Environment **variable** (workflows use **`vars`**); token = **Secret**.
   - More: [cf-workers-env-local](../cf-workers-env-local/SKILL.md).

21. **Optional PostHog / analytics**
   - **`POSTHOG_*`** — optional like **`WEB_*`**; empty → no analytics.
   - **Remove completely:** drop **`posthogRequirements`** from [`apps/web/env.requirements.ts`](../../../apps/web/env.requirements.ts); delete unused **`apps/web/app/**`** helpers (component, **`analytics*.ts`**); remove extra **`alchemy.run.ts`** bindings; **`bun remove`** **`@posthog/*`** / **`posthog-js`** from **`apps/web`** if present.
   - Root README: **Optional: PostHog**.

22. **Preview deploy vs destroy — top-level `requireEnv`**
   - **`alchemy destroy`** loads **`alchemy.run.ts`** the same way **`alchemy deploy`** does: any **`requireEnv("…")`** at **module scope** must be set for **`destroy:preview`** too.
   - Locally that usually means **`.env.staging`** (see **`dotenv-cli -e …`** on **`destroy:preview`** scripts). In CI, mirror **`Turbo deploy (preview)`** **`env:`** on **Destroy PR preview** in **[`.github/workflows/pr-deploy.yml`](../../../.github/workflows/pr-deploy.yml)** — otherwise post-merge teardown fails with **`… is not set`** from a worker/DO **`alchemy.run.ts`** (e.g. **`APP_PUBLIC_BASE_URL`**).
   - Alternatives: avoid module-scope **`requireEnv`** for vars only needed at runtime, or use a destroy-safe placeholder where appropriate.

## Also load

- [cf-workers-patterns.mdc](../../rules/cf-workers-patterns.mdc) — short always-on reminder for workers, env, routes.
- [cf-realtime-websockets.mdc](../../rules/cf-realtime-websockets.mdc) — Socka default, no fake WebSocket hosts (when working on `durable-objects/*`, `apps/web`, or `/api/ws`).
- [cf-socka-realtime/SKILL.md](../cf-socka-realtime/SKILL.md) — end-to-end Socka + DO + web checklist.
