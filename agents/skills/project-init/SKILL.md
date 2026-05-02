---
name: project-init
description: Personalizes a fork of this Cloudflare multi-worker monorepo—Alchemy application ids (`await alchemy` literals + `--app`), npm workspace names (`--filter`), README, and UI—so Cloudflare dashboards and Turbo filters are not confusing. Use when the user created a repo from the template, wants to deploy their own app, or asks to rename workers, rebrand, or remove generic starter kit copy. Skip when developing the upstream starter kit (origin URL contains firtoz/cf-multiworker-starter-kit; canonical https://github.com/firtoz/cf-multiworker-starter-kit) unless the user explicitly asks.
---

# Project initialization (personalize your fork)

Use this skill when someone is building **their** app on top of this starter kit—not when maintaining the upstream repo at [https://github.com/firtoz/cf-multiworker-starter-kit](https://github.com/firtoz/cf-multiworker-starter-kit).

**Guard:** If `git remote get-url origin` contains `firtoz/cf-multiworker-starter-kit`, do **not** run this flow unless the user explicitly requests renaming or templating work.

**Note — infra naming is code-first**

- Set **`PRODUCT_PREFIX`** once in **[`worker-peer-scripts.ts`](../../packages/alchemy-utils/src/worker-peer-scripts.ts)** (**`CF_STARTER_APPS`** derives each Alchemy **`appId`**).
- **`deploy` / `destroy` / `dev`** scripts use **[`alchemy-cli.ts`](../../packages/alchemy-utils/src/alchemy-cli.ts)** with those keys — don’t duplicate **`--app`** strings by hand.
- Keep **`await alchemy("…")`** literals in each **`alchemy.run.ts`** aligned with that table, then **`bun run typegen`**.
- Worker branding lives in **TypeScript**, not env vars. See [cf-starter-workflow](../cf-starter-workflow/SKILL.md) and [cf-starter-gotchas](../cf-starter-gotchas/SKILL.md).

**Adding** a DO package or worker binding after fork setup — use the small focused skills, not one giant doc:

- [cf-durable-object-package](../cf-durable-object-package/SKILL.md) — **`durable-objects/*`**, Alchemy + Hono.
- [cf-web-alchemy-bindings](../cf-web-alchemy-bindings/SKILL.md) — web **`alchemy.run.ts`**, workspace deps.
- [cf-worker-rpc-turbo](../cf-worker-rpc-turbo/SKILL.md) — **`workers/rpc`**, Turbo **`dev` / `destroy:*`**, cyclic **`WorkerStub` / `WorkerRef`**.

## 1. Gather information

Ask the user (or infer from context):

- **Product slug / prefix** — short literal used in **`alchemy("myslug-frontend")`** style (**not** `$VAR + "-frontend"`). Example: **`skybook`** → **`skybook-frontend`**, **`skybook-database`**, … (see README “Code-first infra names”).
- **Workspace package names (`package.json` `name`)** — often **`skybook-web`**, **`skybook-db`**, … — separate from Alchemy **`--app`** — used mainly for **`turbo run … --filter=…`**.
- **One-line description** — README, meta tags, home hero copy.
- **Chatroom DO** — `durable-objects/chatroom-do`; web binds **`ChatroomDo`**; internal secret **`CHATROOM_INTERNAL_SECRET`** (already in env flows).
- **D1** — `packages/db` + optional **`D1_DATABASE_NAME`** / **`D1_DATABASE_ID`** in **`.env.local`** / **`.env.production`** for remote/local debugging; **`CF_STARTER_APPS.database`** (**[`packages/db/alchemy.run.ts`](../../packages/db/alchemy.run.ts)**) drives migrations (**`alchemy-cli.ts deploy database`**).

## 2. Code-first Alchemy ids and Workers

- Each deployable **`alchemy.run.ts`** has one **`await alchemy(<appId>, { … })`**; **`STAGE`** comes from **`package.json`** scripts (**`dotenv-cli -v STAGE=…`** or CI).
- **`alchemy("…")`** must match **`CF_STARTER_APPS`** for that package (**`frontend`**, **`chatroom`**, …).
- **`alchemy-cli.ts`** resolves **`alchemy dev|deploy|destroy --app …`** from the **same** keys — avoid extra hard-coded **`--app`** strings that can drift.

### Where **`PRODUCT_PREFIX`** drives ids

- **[**`CF_STARTER_APPS`** + **`PRODUCT_PREFIX`**](../../packages/alchemy-utils/src/worker-peer-scripts.ts)** — Canonical Alchemy **`appId`** strings. **`alchemy-cli.ts`** accepts these keys (**`frontend`**, **`chatroom`**, **`ping`**, **`other`**, **`database`**, **`stateHub`**, **`admin`**) plus arbitrary **suffix** segments for **`${PRODUCT_PREFIX}-<suffix>`** (generator-created DO packages). Forks change **`PRODUCT_PREFIX`** once.

| Package folder | Typical **`appId`** (**`PRODUCT_PREFIX = cf-starter`**) | Turbo **`--filter`** uses workspace **`name`** (starter) |
|----------------|----------------------------------------------------------|--------------------------------------------------------|
| `apps/web` | **`cf-starter-frontend`** (**`CF_STARTER_APPS.frontend`**) | `cf-starter-web` |
| `durable-objects/chatroom-do` | **`cf-starter-chatroom`** | `chatroom-do` |
| `durable-objects/ping-do` | **`cf-starter-ping`** | `ping-do` |
| `durable-objects/other-worker` | **`cf-starter-other`** | `other-worker` |
| `packages/db` | **`cf-starter-database`** | `cf-starter-db` |
| `packages/state-hub` | **`${PRODUCT_PREFIX}-state-hub`** (**`CF_STARTER_APPS.stateHub`**) | `state-hub` |

- **Resource ids (short):** **`Worker(DEFAULT_WORKER_RESOURCE_ID)`** with **`DEFAULT_WORKER_RESOURCE_ID = "worker"`**; **`ReactRouter`** uses **`DEFAULT_REACT_ROUTER_WEB_RESOURCE_ID` (`"web"`)**; D1 **`D1Database(DEFAULT_D1_DATABASE_RESOURCE_ID)`** with **`db`**. Omit explicit **`name:`** so Cloudflare script names derive from **`${alchemyAppId}-${resource}-${stage}`**.
- **Cyclic stubs** (`ping-do` ↔ `other-worker`): **`omitDefaultPhysicalWorkerScriptName(<peer-alchemy-app>, app.stage)`** feeds **`WorkerRef.service`** / **`WorkerStub.name`**, matching omit-default **`Worker("worker")`** physical names — see [cf-worker-rpc-turbo](../cf-worker-rpc-turbo/SKILL.md).

Cross-package consumers still **`import`** provider **`./alchemy`** exports (**hub** bindings from web). **`className`** on **`DurableObjectNamespace`** must match your TS exported class (**`PingDo`**…).

After edits: **`bun run typegen`** from the repo root. **`env.d.ts`** reflects exported **`./alchemy`**.

## 3. Package names (`package.json`)

- **Root** [`package.json`](../../package.json): set **`"name"`** to the fork project slug (replaces `cf-multiworker-starter-kit`).
- **`apps/web/package.json`**: set **`"name"`** (e.g. **`my-saas-web`**) — **Turbo filter** usage; **`alchemy`** app id stays in **`alchemy.run.ts`** (**`CF_STARTER_APPS.frontend`** …).
- Each DO/worker **`package.json`**: **`deploy`/`destroy`/`dev`** scripts should call **`alchemy-cli.ts`** with the **`CF_STARTER_APPS`** key that matches **`alchemy("…")`** in **`alchemy.run.ts`**.
- **`packages/state-hub`**: **`alchemy.run.ts`** stays on **`CF_STARTER_APPS.stateHub`**; scripts use **`alchemy-cli.ts … stateHub`** (provision-only shared CI Cloudflare state).
- **`workspace:*` dependencies:** If you rename a workspace package (**`chatroom-do`** folder / **`name`**), update every consumer and **`bun install`**.

## 4. README

Rewrite [`README.md`](../../README.md) for the **product**:

- Title, description, **`bun install`**, **`bun run dev`**, **`bun run deploy:prod`** (and **`deploy:staging`** / **`deploy:preview`** as needed).
- Update or shorten template links/marketing unless you keep attribution.
- Keep CI, scripts, **`ALCHEMY_PASSWORD`/`CHATROOM_INTERNAL_SECRET`** — [cf-workers-env-local](../cf-workers-env-local/SKILL.md).
- Mention **liter Alchemy **`--app`** IDs** (`cf-starter-*` → your slug) alongside **workspace **`name`****.

## 5. UI and meta copy

- [`apps/web/app/welcome/welcome.tsx`](../../apps/web/app/welcome/welcome.tsx) — page title / intro.
- [`apps/web/app/routes/home.tsx`](../../apps/web/app/routes/home.tsx) — `meta` title and description.
- [`apps/web/app/routes/chat.tsx`](../../apps/web/app/routes/chat.tsx) — `meta` if you keep chat.

## 6. CONTRIBUTING

- [`CONTRIBUTING.md`](../../CONTRIBUTING.md) — replace `<your-repo>` with the clone URL where present.

## 7. Optional: grep / nested docs

Search for **`cf-multiworker-starter-kit`**, **`github.com/firtoz/cf-multiworker-starter-kit`**, old **`alchemy("web")`** / **`alchemy("ping-do")`** if any remain. Nested READMEs under **`apps/web`**, **`durable-objects/*`**.

## 8. Verification

```bash
bun run typegen
bun run typecheck
bun run lint
bun run build
```

Fix any failures before considering initialization complete.
