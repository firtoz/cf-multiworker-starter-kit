---
name: cf-starter-workflow
description: Repo-root commands, typegen and typecheck cadence, lint, deploy, adding packages with bun, and Alchemy app layout. Use at the start of a task, before PR, or when choosing turbo/typegen commands.
---

# cf-multiworker — agent workflow and workspace layout

## Run from repo root

**New fork?** README **Quick Start (three lanes)** — **`bun run quickstart`**, **`onboard:staging`**, **`onboard:prod`**. Env files: [cf-workers-env-local/SKILL.md](../cf-workers-env-local/SKILL.md).

Build, typecheck, lint, and typegen from the **workspace root** so Turbo can order work across packages.

```bash
bun run build
bun run typecheck
bun run lint
bun run typegen
```

Avoid `cd apps/web && …` for those unless you are debugging a single package in isolation; the root scripts define the monorepo graph. More: [turborepo/SKILL.md](../turborepo/SKILL.md).

## Generated artifacts and Drizzle migrations

Generated files are output, not source of truth. Do not manually author React Router `+types`, Drizzle SQL migrations, Drizzle `meta/*.json` snapshots, Drizzle driver-specific migration wrappers, lockfiles, or `.alchemy/` state. Change the source file and run the generator/package manager instead.

For Drizzle:

1. Edit `packages/db/src/schema.ts` for root D1, or `durable-objects/<name>/src/schema.ts` for package-local Durable Object SQLite.
2. Ensure the package `drizzle.config.ts` uses the right driver (`driver: "d1-http"` for D1, `driver: "durable-sqlite"` for DO SQLite).
3. Run `bun run db:generate` for root D1, or the DO package's `db:generate` script when present.
4. Commit the generated SQL/meta output. PR review should flag hand-written migration SQL or fabricated snapshot JSON unless the change explicitly says it is repairing generated history.

## Typegen, typecheck, and lint cadence

During feature work, test after each meaningful sub-step with the narrowest useful check. Commit after a stable verified checkpoint, then push/update the PR. Avoid waiting until the end to discover typegen, typecheck, lint, or migration drift.

Whenever you change routes, `apps/web/app/routes.ts`, any `alchemy.run.ts`, or env / bindings:

- `bun run typegen` (React Router + local env assumptions)
- `bun run typecheck`
- `bun run lint` before calling the task done (Biome may rewrite; re-run as needed)

Whenever you change Drizzle schema:

- Root D1: `bun run db:generate`
- Durable Object SQLite: package-local `db:generate` if present
- Then run `bun run typecheck` and `bun run lint` from the repo root

For **production** parity: `turbo run typegen:prod` then `turbo run typecheck:prod` if prod env differs.

## User-facing work is more than typecheck

For **UI**, **routes**, **canvas/pointer**, or **realtime** changes, **typecheck + lint are necessary but not sufficient.**

- Do **smoke** checks: right route renders, nothing obviously broken.
- Prefer **in-browser** verification (e.g. Cursor **cursor-ide-browser** MCP, or project E2E).
- For visual work: open the app, **screenshot** key surfaces; for interactions, use **automation** (click / type / pointer). A lone `fetch` to an action does **not** prove the UI works.

[dev-server.mdc](../../rules/dev-server.mdc): do not start **`bun run dev`** unless the user asked or you need it to verify.

**Cloudflare `Env`:** Comes from each package’s `env.d.ts` and the worker resource exported from that package’s `alchemy.run.ts` (web uses `WebBindingResources` + `Bindings.Runtime<… & { ASSETS }>`; see [apps/web/types/env.d.ts](../../../apps/web/types/env.d.ts), [apps/web/alchemy.run.ts](../../../apps/web/alchemy.run.ts)).

## Package installation

Install from the repo root; scope adds to a single app when needed.

```bash
bun add <package>@latest --filter apps/web
# or
bun add <package>@latest --cwd apps/web
```

For versions shared across workspaces, **`package.json` → `workspaces.catalog`** is the single source of truth (`alchemy`, **`drizzle-orm`**, TypeScript-related pins, **`@cloudflare/workers-types`**, etc.). Add with the catalog protocol, e.g. **`bun add hono@catalog --cwd durable-objects/ping-do`** or **`bun add -d drizzle-orm@catalog --cwd packages/db`**.

## Turborepo (short)

- **`^task`** in a package’s `turbo.json` runs `task` in **workspace dependencies**; prefer that over listing every `other-pkg#…` by hand.
- **Per-package `inputs`** — only that package’s files; use `^` + workspace deps to invalidate, not other packages’ source trees. [turborepo/SKILL.md](../turborepo/SKILL.md).
- **Cache** — at root, `dev`, `dev:preflight`, `deploy:*`, `destroy:*`, and `clean` are `cache: false` (`deploy:*` so Alchemy always runs; see [turborepo/SKILL.md](../turborepo/SKILL.md)). Use `turbo run <task> --force` to bypass cache for other tasks when needed.

## D1 and Alchemy migrations

The root D1 schema source of truth is `packages/db/src/schema.ts`. Do not add runtime `CREATE TABLE` fallbacks in app loaders/actions to compensate for missed migrations.

After D1 schema changes:

1. Run `bun run db:generate`.
2. Run `bun run dev` or the right stage deploy, e.g. `bun run deploy:prod` / `deploy:staging` (preview: `deploy:preview` with `STAGE=pr-<n>` from CI).
3. Turbo/Alchemy applies migrations through `packages/db/alchemy.run.ts` (`D1Database.migrationsDir` → `packages/db/drizzle`). The web app binds `mainDb` from `cf-starter-db/alchemy`.

There is no separate D1 migrate command: Alchemy applies the generated migrations when the database app runs during **`bun run dev`** or **`bun run deploy:*`**.

If local dev still reports `no such table`:

- Check that `bun run db:generate` produced or preserved the expected migration.
- Check that `packages/db/alchemy.run.ts` still points `D1Database.migrationsDir` at `packages/db/drizzle`.
- Restart `bun run dev`.
- If generated local state is stale, stop dev and remove the relevant local `.alchemy/` app state before restarting. Do not commit `.alchemy/`.

## Alchemy in this monorepo (summary)

- **Source of truth** — Each deployable package owns an `alchemy.run.ts` and, when consumed elsewhere, exports via `"./alchemy"` (see [Alchemy Turborepo](https://alchemy.run/guides/turborepo/), [type-safe bindings](https://alchemy.run/concepts/bindings/#type-safe-bindings)).
- **Root** — `bun run dev` and stage-specific `deploy:*` / `destroy:*` call Turbo; package scripts use `alchemy dev|deploy|destroy --app <package-id>`.
- **Cross-package** — Provider packages export from `./alchemy`; consumers use `providerWorker.bindings.YourResource` in their `alchemy.run.ts` for cross-script DOs. Details: [cf-web-alchemy-bindings/SKILL.md](../cf-web-alchemy-bindings/SKILL.md), [cf-durable-object-package/SKILL.md](../cf-durable-object-package/SKILL.md).

## Adding another Durable Object (quick path)

1. `bunx turbo gen durable-object` (or copy `durable-objects/ping-do/`).
2. Export DO/worker from `./alchemy`; wire [apps/web/alchemy.run.ts](../../../apps/web/alchemy.run.ts) and root `dev` / `destroy:*` (see [cf-starter-gotchas](../cf-starter-gotchas/SKILL.md) #15, [cf-worker-rpc-turbo/SKILL.md](../cf-worker-rpc-turbo/SKILL.md)).
3. `bun run dev`, exercise bindings, confirm existing DOs still work.

## Environment variables and secrets

Real keys: **`.env.local`** (dev), **`.env.staging`** (staging + PR preview deploys), **`.env.production`** (prod). **`.env.example`** is documentation only. Never commit secrets. Full checklist: [cf-workers-env-local/SKILL.md](../cf-workers-env-local/SKILL.md), [Alchemy Secret](https://alchemy.run/providers/cloudflare/secret/).

Access in app code: `import { env } from "cloudflare:workers"` only.

### Deploy, CI, and secrets (cheat sheet)

- **Full deploy graph** — **`bun run deploy:prod`** / **`deploy:staging`** / **`deploy:preview`** run the whole Turbo **`deploy:*`** graph (D1 + workers + web), **not** web-only. **`packages/state-hub`** goes first because every deploy package lists it as a **`devDependency`**, so **`dependsOn`** **`^deploy:*`** runs the shared Alchemy state hub before siblings.
- **How stage env is wired** — Each **`alchemy.run.ts`** reads **`process.env.STAGE`** ([`deployment-stage.ts`](../../../packages/alchemy-utils/src/deployment-stage.ts)). Package **`deploy` / `destroy` / `dev`** scripts use **[`alchemy-cli.ts`](../../../packages/alchemy-utils/src/alchemy-cli.ts)** with **`CF_STARTER_APPS`** keys after **`dotenv-cli`** loads **`.env.staging`** / **`.env.production`**, so **`--app`** follows **`PRODUCT_PREFIX`** without hard-coding **`cf-starter-*`**. In CI, missing dotfiles mean secrets/vars come from **GitHub Environment** via **`process.env`**.
- **Must-match password** — `requireAlchemyPassword(app)` needs **`ALCHEMY_PASSWORD`**; the example chatroom path needs **`CHATROOM_INTERNAL_SECRET`**. **`ALCHEMY_PASSWORD`** must be the **same** for every **`alchemy deploy`** on that stage (local dotfiles **and** GitHub **secrets**).
- **`github:sync:*` (trusted machine only)** — **`bun run github:sync:staging`** / **`github:sync:prod`** run **[`stacks/admin.ts`](../../../stacks/admin.ts)** to push GitHub **secrets** (Alchemy password, chatroom secret, **`CLOUDFLARE_API_TOKEN`**) and **variables** (**`CLOUDFLARE_ACCOUNT_ID`**, **`CF_STARTER_DEPLOY_ENABLED=true`** when omitted in the dotfile). Defaults to **`gh auth token`** / **`gh repo view`** — do **not** run this from routine CI.
- **Repo policy (not dotenv)** — Merge toggles, rulesets (`main`: PR-only for writers by default with **Repository admin** bypass; **`allowRepositoryAdminBypassOnMain`** / **`requirePullRequestBeforeMerge`** in **[`config/github.policy.ts`](../../../config/github.policy.ts)**), and Environment deployment rules live under **`github.sync.*`** and **`github.environments.*`**. Staging sync can apply REST + rulesets; see README *GitHub admin sync reference*, [`github-repository-settings-sync.ts`](../../../stacks/github-repository-settings-sync.ts), [`github-repo-rulesets-sync.ts`](../../../stacks/github-repo-rulesets-sync.ts).
- **`github:env:*`** — Updates **only** GitHub **`RepositoryEnvironment`** deployment protection from the policy file ([`github-repository-environment-from-env.ts`](../../../stacks/github-repository-environment-from-env.ts)); stage dotfile is merged when present for local process env only.
- **Interactive setup** — **`bun run quickstart`** (local) and **`bun run onboard:staging`** / **`onboard:prod`** (CI bootstrap — README *Quick Start*). **`bun run github:setup`** prints an Actions overview. **`bun run setup`** / **`setup:local`** opens the variable browser; **`bun run setup -- --yes`** (or **`bun packages/scripts/src/setup-env.ts --yes`**) is for automation and only auto-fills regeneratable keys.
- **Further reading** — [Alchemy encryption password](https://alchemy.run/concepts/secret/#encryption-password), [GitHubSecret](https://alchemy.run/providers/github/secret/), [Getting started](https://alchemy.run/getting-started/) — **`CLOUDFLARE_API_TOKEN`**.

- **Local dev** — `bun run dev` runs a filtered `turbo run dev` (web + **`cf-starter-db`** + worker apps), each via **`alchemy-cli.ts dev …`** → **`alchemy dev --app …`** ([Alchemy monorepo](https://alchemy.run/guides/turborepo/)).
   - **Smoke:** hit `/`, `/visitors`, `/ping-do`, `/chat` once (SSR, D1, cross-worker bindings, chat WebSockets).
   - **Stale web / dead port:** if the log shows `webUrl` for **5173** but the port is dead after a crash, delete **`.alchemy/pids/cf-starter-web.pid.json`**. If you removed **`.alchemy/logs/cf-starter-web.log`**, recreate an **empty** file before restart—Alchemy’s log follower expects it.

## Completion checklist (before you stop)

- [ ] Touched routes, `alchemy.run.ts`, `env.d.ts`, or env → `bun run typegen` (and prod pair if needed).
- [ ] `bun run lint` passes.
- [ ] `bun run typecheck` passes.
- [ ] If the change is **user-facing** (UI, navigation, forms, **canvas/pointer**, **WebSockets**): exercise the feature in a **browser** or automation when feasible; for canvas/realtime, see [cf-socka-realtime/SKILL.md](../cf-socka-realtime/SKILL.md) pre-merge checklist.
- [ ] **Cloud agents** (if your session is a cloud task): when you changed code, **`git add` / `git commit` / `git push` before you finish** — do not leave changes only in the working tree. [00-cloud-agent-mandatory.mdc](../../rules/00-cloud-agent-mandatory.mdc). **IDE / local chat agents** usually do not commit: [git-workflow.mdc](../../rules/git-workflow.mdc).

## Related

- [cf-socka-realtime/SKILL.md](../cf-socka-realtime/SKILL.md) — realtime WebSocket + canvas/pointer and pre-merge checks.
- [cf-starter-gotchas](../cf-starter-gotchas/SKILL.md) — numbered gotchas and edge cases.
- [project-init](../project-init/SKILL.md) — rename workers/docs after forking the template.
- [packages/scripts/src/dev-preflight.ts](../../../packages/scripts/src/dev-preflight.ts) — `scripts#dev:preflight` runs Alchemy state password checks (Turbo `dev` dependency).
