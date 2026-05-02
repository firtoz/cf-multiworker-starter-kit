---
name: cf-starter-gotchas
description: Fork and template gotchas (env import, routes, typegen, forms, D1, Turbo, HMR, new DO packages). Use when working on apps/web or durable-objects, or when behavior diverges from this stack’s conventions.
---

# cf-multiworker — fork / template gotchas

These trip up new contributors and agents most often. For commands and checklists, see [cf-starter-workflow](../cf-starter-workflow/SKILL.md).

1. **Worker bindings and env** — Import the typed `env` from the Workers virtual module, not from React Router context: `import { env } from "cloudflare:workers"`. **Do not** use `context.cloudflare.env` (or similar) for Cloudflare bindings in this stack. More: [cf-workers-patterns.mdc](../../rules/cf-workers-patterns.mdc).

2. **Generated artifacts** — Do not manually author generated files. For Drizzle, edit `packages/db/src/schema.ts` or `durable-objects/<name>/src/schema.ts`, ensure the package `drizzle.config.ts` uses the right driver (`d1-http` for D1, `durable-sqlite` for DO SQLite), then run `bun run db:generate` or the package-local `db:generate`. Treat `drizzle/*.sql`, `drizzle/meta/*.json`, driver-specific migration wrappers, React Router `+types`, lockfiles, and `.alchemy/` as generated output. PR review should flag hand-written Drizzle output unless explicitly requested.

3. **Route path export** — Each file under `apps/web/app/routes/` should export its path for `@firtoz/router-toolkit` (forms, typed submitters), matching `app/routes.ts` (`export const route: RoutePath<"/login"> = "/login";`). [routing/SKILL.md](../routing/SKILL.md).

4. **Regenerate types and verify often** — After routes, `alchemy.run.ts`, or env changes, run `bun run typegen` from the repo root. Run `bun run typecheck` and `bun run lint` regularly while building, not only before a PR. Before production deploys, run `turbo run typecheck:prod` after `typegen:prod` if you changed prod bindings. [cf-starter-workflow](../cf-starter-workflow/SKILL.md). **`ALCHEMY_PASSWORD`** and **`CHATROOM_INTERNAL_SECRET`** are required (no in-repo defaults) — **`bun run setup`** / **`setup:local`** opens a **variable browser** in a TTY; **`bun run setup -- --yes`** / **`CI=true`** non-interactive only auto-fills regeneratable secrets into **`.env.local`**; **`bun run setup:staging`** / **`setup:prod`** target the stage dotfiles (copy from **`.env.local`** is offered in the browser).

5. **Loaders and actions return `Promise<MaybeError<...>>`** — Use `success` / `fail` (and the `MaybeError` type) from `@firtoz/maybe-error` **directly** (they are not re-exported by `@firtoz/router-toolkit`). Annotate loaders, narrow with `loaderData.success`. Use `formAction` for actions. [form-submissions/SKILL.md](../form-submissions/SKILL.md), [routing/SKILL.md](../routing/SKILL.md).

6. **Index route + `formAction` / `useDynamicSubmitter` → 405** — Internal React UI submissions should use `formAction`, `useDynamicSubmitter`, and `await submitter.submitJson(...)` with route path exports. External tools, terminal tests, non-router-aware clients, and plain HTML forms that POST to an index route must target `/?index`; POST `/` will not hit the index action. Prefer a non-index resource route for externally callable create/join endpoints.

7. **Export `formSchema`** (and related router-toolkit exports) for typed submitters when you use them. [form-submissions/SKILL.md](../form-submissions/SKILL.md).

8. **Alchemy + D1** — [packages/db/alchemy.run.ts](../../../packages/db/alchemy.run.ts) (**`CF_STARTER_APPS.database`**, workspace package **`cf-starter-db`**) defines `D1Database` with `migrationsDir` → `packages/db/drizzle`; [apps/web/alchemy.run.ts](../../../apps/web/alchemy.run.ts) imports `mainDb` from `cf-starter-db/alchemy`. Alchemy applies SQL on that app’s deploy/dev per [D1 + Drizzle](https://alchemy.run/guides/drizzle-d1/). Do not hand-manage `D1_DATABASE_ID` in env for the default flow, and do not add runtime `CREATE TABLE` fallbacks in loaders/actions; fix schema generation or local state instead.

9. **Turbo / stale `typegen`** — If route types look wrong, run `turbo run typegen:local --force` (or `typegen:prod` after env changes). [turborepo/SKILL.md](../turborepo/SKILL.md).

10. **JSDoc** — Do not use `*/` inside a `/** ... */` block (it ends the comment early). General TypeScript gotcha.

11. **Empty or stale local D1** — Run `bun run db:generate` after schema changes, then `bun run dev` (repo root) so **`cf-starter-db`** and web Alchemy dev sessions initialize local bindings and apply `packages/db/drizzle`. If D1 still reports `no such table`, confirm the migration was generated, `packages/db/alchemy.run.ts` still points `D1Database.migrationsDir` at `packages/db/drizzle`, restart dev, and reset local Alchemy/D1 state only as a documented troubleshooting step.

12. **Biome `check --write`** — Can modify files after you think you are done; re-run `bun run lint` or review the diff before finishing.

13. **Dev server port** — Vite may pick **5174+** if 5173 is in use; do not hardcode a port when checking in the browser. **Do not** set a fixed `server.hmr.port`: React Router’s client + SSR Vite envs each start an HMR WebSocket server; `@cloudflare/vite-plugin` already ignores Vite HMR upgrades (`sec-websocket-protocol: vite…`) and forwards other `/api/ws/*` upgrades to Miniflare.

14. **Prod D1 / visitors errors** — If `/visitors` fails after deploy, confirm **`bun run deploy:prod`** (or **`packages/alchemy-utils/src/alchemy-cli.ts deploy database`** with the same **`STAGE`**) completed and D1 migrations ran; see [Alchemy D1Database](https://alchemy.run/providers/cloudflare/d1-database/).

15. **New Durable Object / worker package** — Use `import type { CloudflareEnv }` and `new Hono<{ Bindings: CloudflareEnv }>()` in DO workers so `c.env` is typed. Shared RPC types in `workers/rpc.ts` (no `import` from `../env` there); add `package.json#exports` `"./workers/rpc"` when needed. `WorkerRef` / cross-worker: one `workspace:*` direction; the other side uses a relative `../<pkg>/workers/rpc` import to avoid Turbo cycles. New Alchemy apps: root [package.json](../../../package.json) `dev` filter, [turbo.json](../../../turbo.json) `<pkg>#destroy:prod`, `#destroy:staging`, `#destroy:preview` with `dependsOn` on the matching **`cf-starter-web#destroy:*`**, `apps/web/package.json` workspace dependency, [apps/web/alchemy.run.ts](../../../apps/web/alchemy.run.ts) binding, and [apps/web/workers/app.ts](../../../apps/web/workers/app.ts) forwarding path if WebSocket. SQLite DOs need `src/schema.ts`, `drizzle.config.ts` with `driver: "durable-sqlite"`, and package-local `db:generate`; never hand-write their generated migrations. **Do not** add another package’s `workers/app.ts` to [tsconfig.cloudflare.json](../../../apps/web/tsconfig.cloudflare.json) `include`—it can break `cf-starter-web`’s `Env`. Step-by-step: [cf-durable-object-package/SKILL.md](../cf-durable-object-package/SKILL.md), [cf-web-alchemy-bindings](../cf-web-alchemy-bindings/SKILL.md), [cf-worker-rpc-turbo](../cf-worker-rpc-turbo/SKILL.md).

16. **WebSocket forwarding** — Worker upgrade paths must be handled before React Router. Keep the client URL builder prefix and worker prefix identical (for example `/api/my-feature/ws/`), do not intercept Vite HMR WebSockets, and forward the DO request path to `/websocket`. For **Socka**-style RPC + push, follow [cf-socka-realtime/SKILL.md](../cf-socka-realtime/SKILL.md) and use **`@firtoz/socka`** (see `chatroom-do` + `packages/chat-contract`); do not hand-roll JSON wire protocols unless the user asks for raw WebSockets.

17. **SSR/browser boundary** — React Router routes render on the server. Do not touch `window`, `document`, `WebSocket`, `canvas`, `localStorage`, or DOM APIs in module scope, loaders/actions, component render paths, or SSR-running `useMemo`. Browser APIs belong in `useEffect`, event handlers, `ClientOnly` wrappers, or guarded browser-only code. WebSocket URL helpers may read `window.location`, but call them only from client-only code or pass an origin explicitly. Do not use `localhost` / `127.0.0.1` / placeholder WebSocket URLs as **runtime** fallbacks.

18. **Durable Object RPC `using` in local dev** — `@firtoz/hono-fetcher` types real DO HTTP results as disposable when Workers RPC attaches `[Symbol.dispose]`, but Vite SSR / some Miniflare paths may return plain `Response` objects. If `using res = await api.get(...)` throws `Symbol(Symbol.dispose) is not a function`, use `const res = await api.get(...)` in that local route or guard disposer calls. `using api = honoDoFetcherWithName(...)` is safer because the library guards missing stub disposers.

19. **Alchemy dev stale web process state** — If `bun run dev` prints `webUrl: "http://localhost:5173/"` but port 5173 is closed after a web crash, check generated Alchemy state. Remove `.alchemy/pids/cf-starter-web.pid.json` and `.alchemy/web/local/cf-starter-web.json`, ensure `.alchemy/logs/cf-starter-web.log` exists (create an empty file if needed), then restart `bun run dev`. Do not commit `.alchemy/` files.

20. **`CLOUDFLARE_API_TOKEN` vs `CLOUDFLARE_ACCOUNT_ID`** — They must pair to one account. **`CLOUDFLARE_ACCOUNT_ID`** scopes API calls and the account **`workers.dev`** subdomain Alchemy uses for the CI Cloudflare state store; a token scoped to account A with an ID from account B (or swapping the literal values between env keys) yields confusing breakage—often **`[CloudflareStateStore]`** JSON RPC returning **404** **`text/html`**. Align dashboard Account ID with token **Account Resources** and with **`.env.staging`** / **`.env.production`** — on GitHub, keep **`CLOUDFLARE_ACCOUNT_ID`** as an Environment **variable** (deploy workflows read **`vars`**, not **`secrets`**). [`cf-workers-env-local`](../cf-workers-env-local/SKILL.md).

21. **Optional PostHog / analytics** — All **`POSTHOG_*`** keys are optional like **`WEB_*`**. Empty keys → no analytics. To remove the feature entirely, drop **`posthogRequirements`** from [`apps/web/env.requirements.ts`](../../../apps/web/env.requirements.ts), delete unused helpers under `apps/web/app/` (e.g. PostHog component + `analytics*.ts`), remove any `alchemy.run.ts` bindings you added, and uninstall **`@posthog/*`** / **`posthog-js`** from **`apps/web/package.json`** if present. See root README “Optional: PostHog”.

## Also load

- [cf-workers-patterns.mdc](../../rules/cf-workers-patterns.mdc) — short always-on reminder for workers, env, routes.
- [cf-realtime-websockets.mdc](../../rules/cf-realtime-websockets.mdc) — Socka default, no fake WebSocket hosts (when working on `durable-objects/*`, `apps/web`, or `/api/ws`).
- [cf-socka-realtime/SKILL.md](../cf-socka-realtime/SKILL.md) — end-to-end Socka + DO + web checklist.
