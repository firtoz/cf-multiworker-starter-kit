# Cloudflare Multi-Worker Starter Kit

[![GitHub: use this template](https://img.shields.io/badge/GitHub-use%20this%20template-24292e?logo=github)](https://github.com/firtoz/cf-multiworker-starter-kit/generate)
[![License: MIT](https://img.shields.io/badge/license-MIT-22c55e)](https://github.com/firtoz/cf-multiworker-starter-kit/blob/main/README.md#license)

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/workers/)
[![Durable Objects](https://img.shields.io/badge/Durable%20Objects-1e293b?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/durable-objects/)
[![Turborepo](https://img.shields.io/badge/Turborepo-EF4444?logo=turbo&logoColor=white)](https://turbo.build/)
[![React Router](https://img.shields.io/badge/React%20Router-7-121212?logo=react&logoColor=61DAFB)](https://reactrouter.com/)
[![Bun](https://img.shields.io/badge/Bun-000000?logo=bun&logoColor=fff)](https://bun.sh/)
[![Hono](https://img.shields.io/badge/Hono-E36002?logo=hono&logoColor=white)](https://hono.dev/)

![Cloudflare Multi-worker Starter Kit: Monorepo for full-stack Cloudflare Workers & Durable Objects, type safety, ready to ship](docs/branding/banner.jpg)

Production-proven Turborepo monorepo starter kit for full-stack Cloudflare Workers apps: Durable Objects, end-to-end type safety, and a battle-tested deploy pipeline.

**Why this repo exists:** I ship several new projects a week and use this starter as my default stack; it keeps changing when real work surfaces gaps (env flows, deploy safety, typegen, monorepo ergonomics). If it saves you setup time, use it as a template or fork; if you want to tighten patterns for everyone, issues and pull requests are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).

<p align="center">
  <a href="https://peerlist.io/firtoz/project/cloudflare-multiworker-starter-kit" target="_blank" rel="noreferrer">
    <img
      src="https://peerlist.io/api/v1/projects/embed/PRJHA9E6LDQG9KQKD1AJB9M7OM6B7B?showUpvote=true&theme=dark"
      alt="Cloudflare Multi-Worker Starter Kit"
      height="72"
    />
  </a>
</p>

## Why use this?

Building on Cloudflare's edge platform is powerful but complex. This starter kit solves the hard parts so you can focus on your app:

**Jump in:** **[Quick start](#quick-start)** (`bun install`, **`bun run setup`**, **`bun run dev`**).

**[Getting started](#getting-started)**. Read downward: **[Where this doc goes deeper](#where-this-doc-goes-deeper)** (skills table); **[quick start](#quick-start)** (clone repo, **`bun run dev`**); **[Naming your product](#naming-your-product)** when you personalize; **[Production deploy](#production-deploy)** then **[Deploy](#deployment)** when you publish.

### Key features

Brief list; **[breakdown sections](#key-feature-breakdown)** carry the narrative.

- **[Workers & typing](#workers-and-typing)**: Typed Durable Object bindings and Worker RPC (`env.d.ts` per package from Alchemy’s exported resources).
- **[Web app](#web-app)**: React Router 7 + Tailwind, streaming SSR, form actions, 103 Early Hints.
- **[Validation](#validation)**: Typed routes, Hono, shared Zod contracts end to end.
- **[Data & realtime](#data-and-realtime)**: **D1** + **Drizzle** (`packages/db`, `/visitors`); **`chatroom-do`** (**@firtoz/socka**, per-room SQLite) and **`/chat`**.
- **[Shipping](#shipping)**: **[Alchemy](https://alchemy.run/)** apps per package; root **Turbo** runs **`alchemy dev/deploy/destroy`**.
- **[Scaffolding](#scaffolding)**: Turborepo generator for new `durable-objects/*` with package-local **`alchemy.run.ts`**.

## Getting started

**Prerequisites:** [Bun](https://bun.sh/) (repo pins a version via `packageManager` in root **`package.json`**), git, and a **[Cloudflare](https://dash.cloudflare.com/)** account when you run Alchemy.

You can treat onboarding in three layers: the **order of sections below** is: [doc map](#where-this-doc-goes-deeper) → [Quick start](#quick-start) → [Naming your product](#naming-your-product):

1. **Run it locally.** Follow [Quick start](#quick-start): install, seed **`.env.local`**, connect Cloudflare, **`bun run dev`**. No naming changes required to try the sample apps.
2. **Name your product**: Before meaningful deploys or when Cloudflare dashboards should show *your* scripts, set **`PRODUCT_PREFIX`** and sync **`alchemy --app …`**; then **`bun run typegen`**. Full UI/workspace rebrand: **[project-init](agents/skills/project-init/SKILL.md)**.
3. **Ship**: [Production deploy](#production-deploy) below, then [Deployment](#deployment) and **`.env.production`** for ongoing releases.

### Where this doc goes deeper

| When you need… | Open |
|----------------|------|
| **Renaming / branding**: **`PRODUCT_PREFIX`**, **`CF_STARTER_APPS`**, **`alchemy --app`**, workspace **`name`**, UI | **[Naming your product](#naming-your-product)** · **[project-init](agents/skills/project-init/SKILL.md)** |
| Day-to-day repo commands, typegen, deploy order | **[agents/skills/cf-starter-workflow/SKILL.md](agents/skills/cf-starter-workflow/SKILL.md)** |
| Web app routes, SSR, **`env`** patterns | **[apps/web/README.md](apps/web/README.md)** |
| AI/agent playbooks (stack-specific) | **[AGENTS.md](AGENTS.md)** → **[agents/skills/](agents/skills/)** |
| Contributing to this template | **[CONTRIBUTING.md](CONTRIBUTING.md)** |

### Quick start

#### Create the repo

**Option 1 - GitHub UI:**
1. Open [https://github.com/firtoz/cf-multiworker-starter-kit](https://github.com/firtoz/cf-multiworker-starter-kit)
2. Click "Use this template" → "Create a new repository"

**Option 2 - GitHub CLI:**
```bash
gh repo create my-project --template firtoz/cf-multiworker-starter-kit --public
cd my-project
```

#### First-time local dev

```bash
bun install
bun run setup
```

In a **normal terminal**, **`bun run setup`** asks to confirm before appending random **`ALCHEMY_PASSWORD`** and **`CHATROOM_INTERNAL_SECRET`** values to repo-root **`.env.local`**. Pipes, **`CI=true`**, and **`bun run setup -- --yes`** skip the prompt and write immediately (used by CI and agent bootstrap). For production-style env on disk, use **`bun run setup:prod`** (same interactive / **`--yes`** rules for **`.env.production`**).

**First-time Alchemy + Cloudflare (everyone on a new machine):**

1. **`bun alchemy configure`**: Create the **default** profile and connect **Cloudflare** (OAuth is fine; at “Customize scopes?” **No** is the usual choice).
2. **`bun alchemy login`**: Refreshes OAuth tokens when needed.
3. **`.env.local`**: After **`bun run setup`**, **`ALCHEMY_PASSWORD`** and **`CHATROOM_INTERNAL_SECRET`** exist; optional **`CLOUDFLARE_API_TOKEN`** and **`CLOUDFLARE_ACCOUNT_ID`** if you do not use the profile; see [Alchemy’s Cloudflare auth guide](https://alchemy.run/guides/cloudflare/). See [`.env.example`](.env.example) for all keys.
4. **Secrets**: **Required**; no in-repo defaults. [`cf-starter-alchemy`](packages/cf-starter-alchemy) reads **`ALCHEMY_PASSWORD`** for Alchemy state encryption. The web and chatroom workers both bind **`CHATROOM_INTERNAL_SECRET`** through `alchemy.secret(...)`; the web worker forwards it on `/api/ws/*`, and the chatroom DO rejects `/websocket` when it does not match.

`alchemy dev` / `react-router` load repo-root **`.env.local`** via `bun --env-file` in each package’s **`dev`** script.

Then:

```bash
# One alchemy dev --app <id> per package; each loads ../../.env.local
bun run dev
```

Open the URL Vite/Alchemy prints (usually `http://localhost:5173`; next free port if busy). Root **`bun run dev`** is a [filtered Turborepo dev](https://alchemy.run/guides/turborepo/): e.g. **`cf-starter-web`** plus each worker **`package.json`**: **`alchemy dev --app …`** must stay in sync with **`Naming your product`](#naming-your-product)** later in this README.

If you see **no Cloudflare credentials**, run **`bun alchemy configure`** / **`bun alchemy login`** or add **`CLOUDFLARE_API_TOKEN`** to **`.env.local`**. Missing secrets: rerun **`bun run setup`** or set **`ALCHEMY_PASSWORD`** / **`CHATROOM_INTERNAL_SECRET`** in **`.env.local`**.

#### Production deploy

**First Cloudflare rollout:** From the repo root (after **`bun alchemy configure`** / login and **`.env.production`** or CI secrets as needed):

```bash
bun run deploy
```

Uses **`turbo run deploy --filter=cf-starter-web`** plus dependent **`deploy`** tasks; each package runs **`alchemy deploy --app …`** (**`cf-starter-frontend`**, **`cf-starter-database`**, …: match **`packages/cf-starter-alchemy/worker-peer-scripts.ts`** and each **`package.json`**). Use repo-root **`.env.production`** (or CI) for **`CLOUDFLARE_*`**, **`ALCHEMY_PASSWORD`**, **`CHATROOM_INTERNAL_SECRET`**. For a given stage (e.g. production), **`ALCHEMY_PASSWORD`** must be the **same** value everywhere **`alchemy deploy`** runs—your machine **and** CI (e.g. GitHub Actions)—so Alchemy can decrypt and update the same remote state; see [encryption password](https://alchemy.run/concepts/secret/#encryption-password). Read [Alchemy State](https://alchemy.run/concepts/state/) before shared CI secrets.

To sync that production **`ALCHEMY_PASSWORD`** into GitHub Actions, run the admin stack from a trusted dev/admin machine (not from normal CI):

```bash
gh auth login
bun run github:secrets:sync
```

This uses Alchemy’s GitHub provider to ensure the GitHub Environment exists, then write an environment-scoped **`ALCHEMY_PASSWORD`** secret (default **`GITHUB_ENVIRONMENT=production`**); it falls back to **`gh auth token`** and **`gh repo view`** unless you set **`GITHUB_TOKEN`** / **`GITHUB_REPOSITORY=owner/repo`** explicitly. See [GitHubSecret](https://alchemy.run/providers/github/secret/) and [GitHub provider](https://alchemy.run/providers/github/).

Rebrand app ids (**`PRODUCT_PREFIX`**, **`--app`**): **[Naming your product](#naming-your-product)** and **[project-init](agents/skills/project-init/SKILL.md)**. Deeper prod notes: [Deployment](#deployment).

#### Build on the starter

1. **Personalize infra + copy**: [Naming your product](#naming-your-product) and **[project-init](agents/skills/project-init/SKILL.md)**.
2. **Add stateful features**: `bunx turbo gen durable-object`, then [After `turbo gen durable-object`](#after-turbo-gen-durable-object) (filters, web binding, **`typegen`**).
3. **Wire the web worker**: workspace dep, import **`./alchemy`** in **`apps/web/alchemy.run.ts`**, **`import { env } from "cloudflare:workers"`** in Workers ([cf-starter-gotchas **#1**](agents/skills/cf-starter-gotchas/SKILL.md)).
4. **Schema**: **`packages/db/src/schema.ts`** → **`bun run db:generate`**; no hand-written SQL.
5. **Ship**: **`.env.production`**, stable **`ALCHEMY_PASSWORD`**, **`bun run typecheck`**, **`bun run lint`**, **`bun run build`**, **`bun run deploy`**.

#### Conventions (humans & AI coding agents)

Use **[AGENTS.md](AGENTS.md)** at the repo root (short index to skills) and the **[agents/skills/](agents/skills/)** entries it links (gotchas, workflow, env, Turbo, workers). For the web app only, [apps/web/AGENTS.md](apps/web/AGENTS.md).

### Naming your product

**Fast path:** In **[`packages/cf-starter-alchemy/worker-peer-scripts.ts`](packages/cf-starter-alchemy/worker-peer-scripts.ts)**, change **`PRODUCT_PREFIX`** from **`cf-starter`** to your slug (e.g. **`skybook`**). **`CF_STARTER_APPS`** (roles like **`frontend`**, **`chatroom`**, **`ping`**, **`other`**, **`database`**) derives **`skybook-frontend`**, **`skybook-chatroom`**, …: one prefix, several logical “sub-apps” as separate Alchemy apps.

**Sync the CLI:** Each **`package.json`** **`dev` / `deploy` / `destroy`** script passes **`alchemy … --app …`**: align those **`--app`** strings with the same ids (search/replace is fine). Then **`bun run typegen`** from the repo root.

**Iterate later:** You can tweak individual **`CF_STARTER_APPS`** entries (suffixes like **`-portal`** instead of **`-frontend`**) when your architecture diverges: optional after the **`PRODUCT_PREFIX`** pass. **`omitDefaultPhysicalWorkerScriptName`** in the same file keeps cyclic **`WorkerStub` / `WorkerRef`** strings coherent. **`turbo … --filter=…`** follows **workspace** **`package.json#name`** (e.g. **`cf-starter-web`**): a different knob than **`alchemy --app`**: see [project-init](agents/skills/project-init/SKILL.md).

Dashboard script names reflect [Alchemy physical names](https://alchemy.run/concepts/resource/#physical-name). Examples (**`local`** stage): **`skybook-frontend-web-local`**, **`skybook-chatroom-worker-local`**. Renaming changes identities; see [Adoption](https://alchemy.run/concepts/resource/#adoption).

**Full rebrand checklist** (UI copy, grep, Turbo filters): **[agents/skills/project-init/SKILL.md](agents/skills/project-init/SKILL.md)**.

## Project structure

```
├── agents/                    # Canonical AI rules + skills (source of truth; see agents/README.md)
│   ├── rules/                 # Workspace rules; .cursor/rules is a symlink here
│   ├── skills/                # Project skills; .cursor/skills is a symlink here
│   └── install-symlinks.sh    # Re-create symlinks (`bun run agents:link`; `-- --claude` for .claude/)
├── apps/
│   └── web/                    # React Router 7 app (D1 binding for site data)
│       ├── alchemy.run.ts      # Web Alchemy app and imported worker bindings
│       ├── app/routes/         # Routes (home, visitors, chat, …)
│       └── workers/app.ts      # Cloudflare Worker entry (SSR + /api/ws/* → chatroom DO)
├── .cursor/                    # Cursor-only: environment.json, setup-agent.sh; rules/skills → ../agents/…
├── .claude/                    # Optional: rules/skills → ../agents/… (Claude Code; after bun run agents:link --claude)
├── durable-objects/
│   ├── chatroom-do/            # Multi-room WebSocket DO (Socka + DO SQLite)
│   ├── ping-do/                # Hono DO + service-binding example
│   └── other-worker/           # Plain worker service-binding example
└── packages/
    ├── cf-starter-alchemy/     # Shared Alchemy env/password helpers
    ├── db/                     # cf-starter-db: Drizzle + D1 schema/migrations
    ├── chat-contract/          # Workspace package cf-starter-chat-contract: Socka / chat types
    └── scripts/                # Workspace scripts package (e.g. build helpers)
```

For deeper conventions (env files, `^task` dependencies, caching), see [agents/skills/cf-starter-workflow/SKILL.md](agents/skills/cf-starter-workflow/SKILL.md), [agents/skills/cf-workers-env-local/SKILL.md](agents/skills/cf-workers-env-local/SKILL.md), and [agents/skills/turborepo/SKILL.md](agents/skills/turborepo/SKILL.md).

## Key feature breakdown

Each subsection mirrors a **[Key features](#key-features)** bullet in [Why use this](#why-use-this).

### Workers and typing

Bindings are declared in each package’s **`alchemy.run.ts`** and flow into **`env.d.ts`** (see [agents/skills/cf-starter-workflow/SKILL.md](agents/skills/cf-starter-workflow/SKILL.md)). Use the Workers virtual module:

```typescript
import { env } from "cloudflare:workers";

const room = env.ChatroomDo.getByName("lobby");
// room.fetch(new Request("https://do/websocket", { method: "GET", headers: { Upgrade: "websocket" } }))
```

Worker RPC **`WorkerRef` / `WorkerStub`**, cyclic bindings, and Turbo **`dev`/`destroy`**: **[cf-worker-rpc-turbo](agents/skills/cf-worker-rpc-turbo/SKILL.md)** · **[cf-starter-gotchas](agents/skills/cf-starter-gotchas/SKILL.md)** (**#15**: new DO / cross-worker packages).

### Web app

The web app (**`apps/web/`** · **[apps/web/README.md](apps/web/README.md)** · [apps/web/AGENTS.md](apps/web/AGENTS.md)): React Router 7 + Tailwind, streaming SSR, **`formAction`**, typed loaders/actions with **`@firtoz/router-toolkit`**, 103 Early Hints.

### Validation

Patterns cover typed routes/loaders (**`RoutePath`**), **`formAction`**, **[Zod](https://zod.dev/)**, **Hono** on Workers and Durable Objects, **`@firtoz/maybe-error`** in loaders/actions, and realtime payloads exported from **`cf-starter-chat-contract`** (**`packages/chat-contract`**).

### Data and realtime

**D1 + Drizzle**: Shared schema **`packages/db/src/schema.ts`**; **`cf-starter-db`** drives migrations against **`packages/db/drizzle`**; **`/visitors`** demonstrates query + increment. **`cf-starter-database`** is the **[Alchemy](https://alchemy.run/)** app for remote D1; see [Configuration](#configuration) and **`bun run db:generate`**. **`/visitors` missing after prod deploy?** [cf-starter-gotchas](agents/skills/cf-starter-gotchas/SKILL.md) **#14** (deploy **`cf-starter-database`**, migrations).

**Chat & WebSockets:** Starter reference: **`durable-objects/chatroom-do`**, **`packages/chat-contract`** (`defineSocka`), **`/api/ws/…`** forwarding in **`apps/web/workers/app.ts`**, client URL helper **`apps/web/app/lib/chat-ws-url.ts`**, **`/chat`** UI. Prefer copying that pattern rather than bespoke JSON **`WebSocket`** protocols · **[agents/skills/cf-socka-realtime/SKILL.md](agents/skills/cf-socka-realtime/SKILL.md)**.

### Shipping

Infra-as-code **`alchemy.run.ts`** files per Worker/DO (**[Alchemy](https://alchemy.run/)**); **`bun run dev`** chains filtered **Turbo** tasks that run **`alchemy dev --app …`**. **`bun run deploy`** invokes **`alchemy deploy`** per dependency graph; app ids and **`PRODUCT_PREFIX`**: [Naming your product](#naming-your-product); operations: [Deployment](#deployment) · **[cf-starter-workflow](agents/skills/cf-starter-workflow/SKILL.md)** · [Alchemy + Turborepo](https://alchemy.run/guides/turborepo/).

### Scaffolding

```bash
bunx turbo gen durable-object
# Follow prompts, then implement logic in workers/app.ts
bun run dev
```

The generator scaffolds `durable-objects/<name>/` with a package-local `alchemy.run.ts`, `env.d.ts`, `workers/rpc.ts` (portable `DurableObjectNamespace` RPC type), and `workers/app.ts` using `new Hono<{ Bindings: CloudflareEnv }>()`. Implement routes on the DO’s public `app` and consume them with `honoDoFetcherWithName` from the web app when you add HTTP access.

Full package and Hono checklists: **[agents/skills/cf-durable-object-package/SKILL.md](agents/skills/cf-durable-object-package/SKILL.md)**.

#### After `turbo gen durable-object`

The generator does not wire the monorepo for you. For each new package:

1. **Root [package.json](package.json) `dev`**: Add `--filter=<workspace-name>` so the app joins the root `turbo run dev` TUI. Each package still runs `alchemy dev --app <alchemy-app-id> --stage local`: **`<alchemy-app-id>`** equals **`alchemy("…")`** in that folder (see [Naming your product](#naming-your-product); web **`--filter`** name is still **`cf-starter-web`**).

2. **[turbo.json](turbo.json) `destroy`**: Add `<your-package>#destroy` with `dependsOn: ["cf-starter-web#destroy"]` (match `ping-do#destroy`).

3. **Web**: [apps/web/package.json](apps/web/package.json) `"<your-package>": "workspace:*"`, `bun install`, then wire [apps/web/alchemy.run.ts](apps/web/alchemy.run.ts) from `"<your-package>/alchemy"`.

4. **Types**: `bun run typegen` and `bun run typecheck` from the repo root. Don’t add sibling `workers/app.ts` to the web `include` to “fix” types; see [cf-starter-gotchas](agents/skills/cf-starter-gotchas/SKILL.md) **#15** and [cf-web-alchemy-bindings](agents/skills/cf-web-alchemy-bindings/SKILL.md).

5. **Cross-worker**: `WorkerRef` / `WorkerStub` + `workers/rpc.ts`; see [cf-starter-gotchas](agents/skills/cf-starter-gotchas/SKILL.md) **#15** and [cf-worker-rpc-turbo](agents/skills/cf-worker-rpc-turbo/SKILL.md).

## Configuration

### Environment variables

- **`.env.example`** (committed): **Documentation** for humans/agents; Alchemy and other tools use real gitignored env files, not this file wholesale.
- **`.env.local`** (gitignored): Loaded by **`bun run setup`** and by package **`dev`** scripts via **`bun --env-file`**. Set **`ALCHEMY_PASSWORD`**, **`CHATROOM_INTERNAL_SECRET`**, and optional **`CLOUDFLARE_*`** (see [Quick start](#quick-start)).
- **`.env.production`** (gitignored): Use for **`bun run deploy`** / CI when you want prod-shaped values in a file.

The D1 schema source of truth is **`packages/db/src/schema.ts`**. Do not manually create or edit Drizzle migration SQL, **`drizzle/meta/_journal.json`**, or snapshot JSON. Change the schema, then run **`bun run db:generate`** so generated SQL/meta lands in **`packages/db/drizzle/`**.

The **`cf-starter-db`** **workspace package** owns **`D1Database`** in **`packages/db/alchemy.run.ts`** (**`migrationsDir`** → **`packages/db/drizzle`**). **`apps/web/alchemy.run.ts`** imports **`mainDb`** from **`cf-starter-db/alchemy`**. Remote migrations run when you deploy the **alchemy app** **`cf-starter-database`** (**`alchemy deploy --app cf-starter-database`**, included in **`bun run deploy`** via Turbo **`^deploy`**). **`d1:migrate:local`** prints the dev flow; **`d1:migrate:remote`** runs the same **`cf-starter-db`** **`deploy`** script. Do not add runtime `CREATE TABLE` fallbacks in loaders/actions; if local dev reports `no such table`, check that **`db:generate`** produced a migration, restart dev, and reset local Alchemy/D1 state only as a troubleshooting step.

## Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on pushes and PRs to **`main`**:

1. **Lint**: `bun run lint` (Biome)
2. **Typecheck**: `bun run typegen` then `bun run typecheck`
3. **Build**: `bun run build`

Uses Bun with a frozen lockfile and Turborepo for parallel/cached tasks.

## Deployment

See **[Quick start → Production deploy](#production-deploy)** for the **`bun run deploy`** invocation. **Summary:** **`turbo run deploy --filter=cf-starter-web`** fans out **`alchemy deploy --app …`** with ids from **`PRODUCT_PREFIX`** / **`CF_STARTER_APPS`** ([Naming](#naming-your-product)). **Auth:** **`bun alchemy configure`** / **`bun alchemy login`** or **`CLOUDFLARE_API_TOKEN`** / **`CLOUDFLARE_ACCOUNT_ID`** ([Alchemy Cloudflare guide](https://alchemy.run/guides/cloudflare/)). Use one stable **`ALCHEMY_PASSWORD`** per deploy stage everywhere deploy runs (local **and** CI); **`CHATROOM_INTERNAL_SECRET`** must match web + chatroom. **GitHub Actions secret sync:** **`bun run github:secrets:sync`** runs **`stacks/admin.ts`** locally to manage the environment-scoped **`ALCHEMY_PASSWORD`** secret via [GitHubSecret](https://alchemy.run/providers/github/secret/); do not run that admin stack from normal CI/deploy. More workflow + CI: **[cf-starter-workflow](agents/skills/cf-starter-workflow/SKILL.md)**, [Alchemy State](https://alchemy.run/concepts/state/).

## Scripts

### Development
- `bun run dev`: Filtered **`turbo run dev`**; each package runs **`alchemy dev --app …`** (ids: [Naming your product](#naming-your-product)). [Alchemy + Turborepo](https://alchemy.run/guides/turborepo/).
- `bun run build`: `turbo run build:local`
- `bun run typecheck`: `typecheck:local` across packages
- `bun run typecheck:prod`: Prod-shaped types/config
- `bun run typegen` / `typegen:local`: React Router route types (+ workspace `typegen` chain)
- `bun run typegen:prod`: Prod env inputs for web `typegen:prod`
- `bun run lint`: **`turbo lint`** → each package runs Biome (**`biome check --write`** where defined)
- `bun run d1:migrate:local`: Prints how local D1 migrations apply during **`bun run dev`**
- `bun run d1:migrate:remote`: **`alchemy deploy --app cf-starter-database`** (remote D1 + migrations)

### Deployment
- `bun run deploy`: `turbo run deploy --filter=cf-starter-web` (web app + `^deploy` graph)
- `bun run destroy`: `turbo run destroy`
- `bun run github:secrets:sync`: Local/admin-only Alchemy stack (`stacks/admin.ts`) that syncs the production `ALCHEMY_PASSWORD` to GitHub Actions (uses `gh auth token` / `gh repo view`, or explicit `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, optional `GITHUB_ENVIRONMENT`)

### Dependency management
- `bun run outdated`: Outdated deps across workspaces (includes **Wrangler** via the workspace catalog where packages still use it)
- `bun update wrangler`: From the **repo root**, bumps **Wrangler** to the newest version allowed by **`workspaces.catalog.wrangler`** in root **`package.json`**; **`bun.lock`** pins the exact release
- `bun run update:interactive`: Interactive updates
- `bun run clean`: Remove `node_modules` and build artifacts (**Turbo `clean`**)

### Code generation
- `bunx turbo gen durable-object`: Scaffold a new Durable Object package
- `bun run db:generate`: Regenerate D1 / Drizzle SQL from `packages/db` schema using the `d1-http` driver (writes `packages/db/drizzle/`)
- `bun run check:drizzle-generated`: Warn when generated Drizzle artifacts changed without nearby schema/generator inputs

### Generated artifacts

Safe to hand-edit: TypeScript source, schema source files, route config/modules, Alchemy config, and docs. Generated output should come from tools: React Router `+types`, Drizzle SQL/meta snapshots, Durable Object migration wrappers such as `drizzle/migrations.js`, lockfile changes, and `.alchemy/` state. If generated output needs to change, edit the source of truth and run the generator.

## Stack (at a glance)

[Cloudflare Workers](https://workers.cloudflare.com/) + [Durable Objects](https://developers.cloudflare.com/durable-objects/) · [React Router 7](https://reactrouter.com/) (SSR) · [Hono](https://hono.dev/) · D1 + [Drizzle](https://orm.drizzle.team/) · [Turborepo](https://turbo.build/repo) · [Biome](https://biomejs.dev/) · [Bun](https://bun.sh/) · [Zod](https://zod.dev/). Per-package **`env.d.ts`** and typegen cadence: [agents/skills/cf-starter-workflow/SKILL.md](agents/skills/cf-starter-workflow/SKILL.md). Cache / **`inputs`**: [agents/skills/turborepo/SKILL.md](agents/skills/turborepo/SKILL.md).

## Contributing

Bug reports, doc fixes, and improvements that keep the template honest for day-to-day use are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for PR expectations and quality checks (setup and stack details stay in this README).

## License

MIT
