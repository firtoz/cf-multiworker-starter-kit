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

![Cloudflare Multi-worker Starter Kit — Monorepo for full-stack Cloudflare Workers & Durable Objects, type safety, ready to ship](docs/branding/banner.jpg)

Production-proven Turborepo monorepo starter kit for full-stack Cloudflare Workers apps — Durable Objects, end-to-end type safety, and a battle-tested deploy pipeline.

**Why this repo exists:** I ship several new projects a week and use this starter as my default stack—it keeps changing when real work surfaces gaps (env flows, deploy safety, typegen, monorepo ergonomics). If it saves you setup time, use it as a template or fork; if you want to tighten patterns for everyone, issues and pull requests are welcome—see [CONTRIBUTING.md](CONTRIBUTING.md).

<p align="center">
  <a href="https://peerlist.io/firtoz/project/cloudflare-multiworker-starter-kit" target="_blank" rel="noreferrer">
    <img
      src="https://peerlist.io/api/v1/projects/embed/PRJHA9E6LDQG9KQKD1AJB9M7OM6B7B?showUpvote=true&theme=dark"
      alt="Cloudflare Multi-Worker Starter Kit"
      height="72"
    />
  </a>
</p>

### Where to read next

| Doc | What it is |
| --- | --- |
| [README.md](README.md) (this file) | Monorepo quick start, first-time Alchemy/Cloudflare, `bun run dev` / deploy, product-building path |
| [apps/web/README.md](apps/web/README.md) | Web app: routes, bindings, typegen, web-only tasks |
| [AGENTS.md](AGENTS.md) | Short index of rules and **[agents/skills/](agents/skills/)** (implementation playbooks for this stack, not generic tutorials) |
| [agents/README.md](agents/README.md) | **Canonical** AI rules and skills; symlink layout for Cursor / Claude; `bash agents/install-symlinks.sh` after clone if needed |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute: PRs, quality checks, dependency notes |
| [.cursor/README.md](.cursor/README.md) | Cursor-only files and symlink notes (rules/skills point at `agents/`) |

## Why use this?

Building on Cloudflare's edge platform is powerful but complex. This starter kit solves the hard parts so you can focus on your app:

- **Type Safety Across Workers**: Automatic type generation for Durable Object bindings - call DOs from any worker with full IntelliSense
- **Modern React Stack**: React Router 7 with streaming SSR, form actions, and optimized CSS loading via 103 Early Hints
- **End-to-End Validation**: Typed routes, Worker RPC, Hono endpoints, and shared Zod contracts
- **Ready to Deploy**: **[Alchemy](https://alchemy.run/)** owns package-local dev/deploy/destroy apps; Turbo orders those apps from the repo root

**What's included:**
- React Router 7 web app with TailwindCSS
- **D1** + **Drizzle** in `packages/db` (site visit counter on `/visitors`) with migrations in-repo
- **Chat** sample: **`chatroom-do`** (WebSockets via **@firtoz/socka**, per-room Durable Object SQLite via Drizzle) and `/chat` in the web app
- Turborepo generator to scaffold new Durable Objects with package-local `alchemy.run.ts`
- **`env.d.ts`** per worker package: Alchemy `Env` inferred from exported package worker resources

## Quick start

### Use This Template

**Option 1 - GitHub UI:**
1. Open [https://github.com/firtoz/cf-multiworker-starter-kit](https://github.com/firtoz/cf-multiworker-starter-kit)
2. Click "Use this template" → "Create a new repository"

**Option 2 - GitHub CLI:**
```bash
gh repo create my-project --template firtoz/cf-multiworker-starter-kit --public
cd my-project
```

### Install & run

```bash
bun install
bun run setup
```

In a **normal terminal**, **`bun run setup`** asks to confirm before appending random **`ALCHEMY_PASSWORD`** and **`CHATROOM_INTERNAL_SECRET`** values to repo-root **`.env.local`**. Pipes, **`CI=true`**, and **`bun run setup -- --yes`** skip the prompt and write immediately (used by CI and agent bootstrap). For production-style env on disk, use **`bun run setup:prod`** (same interactive / **`--yes`** rules for **`.env.production`**).

**First-time Alchemy + Cloudflare (everyone on a new machine):**

1. **`bun alchemy configure`** — Create the **default** profile and connect **Cloudflare** (OAuth is fine; at “Customize scopes?” **No** is the usual choice).
2. **`bun alchemy login`** — Refreshes OAuth tokens when needed.
3. **`.env.local`** — After **`bun run setup`**, **`ALCHEMY_PASSWORD`** and **`CHATROOM_INTERNAL_SECRET`** exist; optional **`CLOUDFLARE_API_TOKEN`** and **`CLOUDFLARE_ACCOUNT_ID`** if you do not use the profile; see [Alchemy’s Cloudflare auth guide](https://alchemy.run/guides/cloudflare/). See [`.env.example`](.env.example) for all keys.
4. **Secrets** — **Required**; no in-repo defaults. [`cf-starter-alchemy`](packages/cf-starter-alchemy) reads **`ALCHEMY_PASSWORD`** for Alchemy state encryption. The web and chatroom workers both bind **`CHATROOM_INTERNAL_SECRET`** through `alchemy.secret(...)`; the web worker forwards it on `/api/ws/*`, and the chatroom DO rejects `/websocket` when it does not match.

`alchemy dev` / `react-router` load repo-root **`.env.local`** via `bun --env-file` in each package’s **`dev`** script.

Then:

```bash
# Turbo starts one alchemy dev --app <id> per app (web + worker packages); each process loads ../../.env.local
bun run dev
```

Open the URL Vite/Alchemy prints (usually `http://localhost:5173`; if that port is busy it picks the next, e.g. `5174`). `bun run dev` uses a [filtered `turbo run dev`](https://alchemy.run/guides/turborepo/) so **`cf-starter-web`** and each durable-object package run **`alchemy dev --app …`** in parallel (TUI panes), not Wrangler.

If you see **no Cloudflare credentials**, run **`bun alchemy configure`** / **`bun alchemy login`** or add **`CLOUDFLARE_API_TOKEN`** to **`.env.local`**. If Alchemy says a secret is missing, run **`bun run setup`** or set **`ALCHEMY_PASSWORD`** / **`CHATROOM_INTERNAL_SECRET`** by hand in **`.env.local`**.

### Production deploy

From the repo root:

```bash
bun run deploy
```

which runs **`turbo run deploy --filter=cf-starter-web`** (pulls in dependent worker **`deploy`** tasks). Each package runs **`alchemy deploy --app <package-id>`**. Use repo-root **`.env.production`** (or CI secrets) for **`CLOUDFLARE_*`**, **`ALCHEMY_PASSWORD`**, **`CHATROOM_INTERNAL_SECRET`**, etc., as in **`.env.example`**. Read [Alchemy State](https://alchemy.run/concepts/state/) before wiring shared CI.

**After forking:** Rebrand docs/UI and choose stable worker names in each package’s **`alchemy.run.ts`** before first deploy — see [agents/skills/project-init/SKILL.md](agents/skills/project-init/SKILL.md).

### Build a real product from the starter

1. **Personalize** — rename the root package/app copy, update user-facing copy, and pick stable script names in package `alchemy.run.ts` files before your first production deploy.
2. **Add stateful features** — run `bunx turbo gen durable-object`, implement logic on the Durable Object’s Hono `app`, then run `bun run dev`. After generating a new package, complete [After `turbo gen durable-object`](#after-turbo-gendurable-object) (root `dev` filter, web bindings, rpc).
3. **Consume from web** — add the provider as a workspace dependency, import its `./alchemy` worker resource in `apps/web/alchemy.run.ts`, pass resources into `ReactRouter(…, { bindings })`, then use `import { env } from "cloudflare:workers"` in worker code (see [agents/skills/cf-starter-gotchas/SKILL.md](agents/skills/cf-starter-gotchas/SKILL.md)).
4. **Add data** — update `packages/db/src/schema.ts`, run `bun run db:generate`, and let the web package Alchemy app manage D1. Do not hand-write Drizzle migration SQL or meta snapshots.
5. **Ship** — set `.env.production` / CI secrets, set a stable `ALCHEMY_PASSWORD`, run `bun run typecheck`, `bun run lint`, `bun run build`, then `bun run deploy`.

### Conventions (humans & AI coding agents)

Use **[AGENTS.md](AGENTS.md)** at the repo root (short index to skills) and the **[agents/skills/](agents/skills/)** entries it links (gotchas, workflow, env, Turbo, workers). For the web app only, [apps/web/AGENTS.md](apps/web/AGENTS.md).

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
    ├── db/                     # cf-starter-db — Drizzle + D1 schema/migrations
    ├── chat-contract/          # Shared Socka / chat types for web + DO
    └── scripts/                # Workspace scripts package (e.g. build helpers)
```

For deeper conventions (env files, `^task` dependencies, caching), see [agents/skills/cf-starter-workflow/SKILL.md](agents/skills/cf-starter-workflow/SKILL.md), [agents/skills/cf-workers-env-local/SKILL.md](agents/skills/cf-workers-env-local/SKILL.md), and [agents/skills/turborepo/SKILL.md](agents/skills/turborepo/SKILL.md).

## Key features

### 1. Type-Safe Durable Object Calls

Bindings are declared in each package’s **`alchemy.run.ts`** and flow into **`env.d.ts`** (see [agents/skills/cf-starter-workflow/SKILL.md](agents/skills/cf-starter-workflow/SKILL.md)). Use the Workers virtual module:

```typescript
import { env } from "cloudflare:workers";

const room = env.ChatroomDo.getByName("lobby");
// room.fetch(new Request("https://do/websocket", { method: "GET", headers: { Upgrade: "websocket" } }))
```

### 2. Add New Durable Objects Easily

```bash
bunx turbo gen durable-object
# Follow prompts, then implement logic in workers/app.ts
bun run dev
```

The generator scaffolds `durable-objects/<name>/` with a package-local `alchemy.run.ts`, `env.d.ts`, `workers/rpc.ts` (portable `DurableObjectNamespace` RPC type), and `workers/app.ts` using `new Hono<{ Bindings: CloudflareEnv }>()`. Implement routes on the DO’s public `app` and consume them with `honoDoFetcherWithName` from the web app when you add HTTP access.

**Socka + Durable Object SQLite (WebSocket RPC and push):** The starter’s reference implementation is **`durable-objects/chatroom-do`**, **`packages/chat-contract`** (`defineSocka`), the **`/api/ws/...`** forward in **`apps/web/workers/app.ts`**, and the client URL helper in **`apps/web/app/lib/chat-ws-url.ts`**. Copy and rename that pattern for new rooms rather than hand-rolling a JSON `WebSocket` protocol. See [agents/skills/cf-socka-realtime/SKILL.md](agents/skills/cf-socka-realtime/SKILL.md).

#### After `turbo gen durable-object`

The generator does not wire the monorepo for you. For each new package:

1. **Root [package.json](package.json) `dev`** — Add `--filter=<your-package>` so the app joins the root `turbo run dev` TUI. Each app still uses `alchemy dev --app <id>` in its own `package.json` (see [Alchemy Turborepo](https://alchemy.run/guides/turborepo/); web = `cf-starter-web`).

2. **[turbo.json](turbo.json) `destroy`** — Add `<your-package>#destroy` with `dependsOn: ["cf-starter-web#destroy"]` (match `ping-do#destroy`).

3. **Web** — [apps/web/package.json](apps/web/package.json) `"<your-package>": "workspace:*"`, `bun install`, then wire [apps/web/alchemy.run.ts](apps/web/alchemy.run.ts) from `"<your-package>/alchemy"`.

4. **Types** — `bun run typegen` and `bun run typecheck` from the repo root. Don’t add sibling `workers/app.ts` to the web `include` to “fix” types—see [cf-starter-gotchas](agents/skills/cf-starter-gotchas/SKILL.md) **#14** and [cf-web-alchemy-bindings](agents/skills/cf-web-alchemy-bindings/SKILL.md).

5. **Cross-worker** — `WorkerRef` / `WorkerStub` + `workers/rpc.ts`; see [cf-starter-gotchas](agents/skills/cf-starter-gotchas/SKILL.md) **#14** and [cf-worker-rpc-turbo](agents/skills/cf-worker-rpc-turbo/SKILL.md).

Full package and Hono checklists: [cf-durable-object-package](agents/skills/cf-durable-object-package/SKILL.md).

## Configuration

### Environment variables

- **`.env.example`** (committed) — **Documentation** for humans/agents; Alchemy and other tools use real gitignored env files, not this file wholesale.
- **`.env.local`** (gitignored) — Loaded by **`bun run setup`** and by package **`dev`** scripts via **`bun --env-file`**. Set **`ALCHEMY_PASSWORD`**, **`CHATROOM_INTERNAL_SECRET`**, and optional **`CLOUDFLARE_*`** (see [Quick Start](#install--run)).
- **`.env.production`** (gitignored) — Use for **`bun run deploy`** / CI when you want prod-shaped values in a file.

The D1 schema source of truth is **`packages/db/src/schema.ts`**. Do not manually create or edit Drizzle migration SQL, **`drizzle/meta/_journal.json`**, or snapshot JSON. Change the schema, then run **`bun run db:generate`** so generated SQL/meta lands in **`packages/db/drizzle/`**.

The **`cf-starter-db`** package owns **`D1Database`** in **`packages/db/alchemy.run.ts`** (**`migrationsDir`** → **`packages/db/drizzle`**). **`apps/web/alchemy.run.ts`** imports **`mainDb`** from **`cf-starter-db/alchemy`**. Remote migrations run when you deploy that app (**`alchemy deploy --app cf-starter-db`**, included in **`bun run deploy`** via Turbo **`^deploy`**). **`d1:migrate:local`** prints the dev flow; **`d1:migrate:remote`** runs the same Alchemy deploy as **`cf-starter-db`** **`deploy`**. Do not add runtime `CREATE TABLE` fallbacks in loaders/actions; if local dev reports `no such table`, check that **`db:generate`** produced a migration, restart dev, and reset local Alchemy/D1 state only as a troubleshooting step.

## Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on pushes and PRs to **`main`**:

1. **Lint** — `bun run lint` (Biome)
2. **Typecheck** — `bun run typegen` then `bun run typecheck`
3. **Build** — `bun run build`

Uses Bun with a frozen lockfile and Turborepo for parallel/cached tasks.

## Deployment

Production is **`bun run deploy`** → **`turbo run deploy --filter=cf-starter-web`**. Each package in the graph runs **`alchemy deploy --app <package-id>`**. Use **`bun alchemy configure`** / **`bun alchemy login`** or **`CLOUDFLARE_API_TOKEN`** (and **`CLOUDFLARE_ACCOUNT_ID`** when needed) as in [Alchemy’s Cloudflare guide](https://alchemy.run/guides/cloudflare/). Set **`ALCHEMY_PASSWORD`** for real deployments and shared state so encrypted secrets in Alchemy state stay meaningful; set **`CHATROOM_INTERNAL_SECRET`** to the same stable value for both web and chatroom apps. See [agents/skills/cf-starter-workflow/SKILL.md](agents/skills/cf-starter-workflow/SKILL.md) and [State](https://alchemy.run/concepts/state/) for CI.

## Scripts

### Development
- `bun run dev` — Filtered `turbo run dev`: **`alchemy dev --app web`** plus **`alchemy dev --app`** each worker package (see [Alchemy Turborepo](https://alchemy.run/guides/turborepo/))
- `bun run build` — `turbo run build:local`
- `bun run typecheck` — `typecheck:local` across packages
- `bun run typecheck:prod` — Prod-shaped types/config
- `bun run typegen` / `typegen:local` — React Router route types (+ workspace `typegen` chain)
- `bun run typegen:prod` — Prod env inputs for web `typegen:prod`
- `bun run lint` — Biome (`check --write`)
- `bun run d1:migrate:local` — Prints how local D1 migrations apply during **`bun run dev`**
- `bun run d1:migrate:remote` — **`alchemy deploy --app cf-starter-db`** (remote D1 + migrations)

### Deployment
- `bun run deploy` — `turbo run deploy --filter=cf-starter-web` (web app + `^deploy` graph)
- `bun run destroy` — `turbo run destroy`

### Dependency management
- `bun run outdated` — Outdated deps across workspaces (includes **Wrangler** via the workspace catalog where packages still use it)
- `bun update wrangler` — From the **repo root**, bumps **Wrangler** to the newest version allowed by **`workspaces.catalog.wrangler`** in root **`package.json`**; **`bun.lock`** pins the exact release
- `bun run update:interactive` — Interactive updates
- `bun run clean` — Remove `node_modules` and build artifacts (**Turbo `clean`**)

### Code generation
- `bunx turbo gen durable-object` — Scaffold a new Durable Object package
- `bun run db:generate` — Regenerate D1 / Drizzle SQL from `packages/db` schema using the `d1-http` driver (writes `packages/db/drizzle/`)
- `bun run check:drizzle-generated` — Warn when generated Drizzle artifacts changed without nearby schema/generator inputs

### Generated artifacts

Safe to hand-edit: TypeScript source, schema source files, route config/modules, Alchemy config, and docs. Generated output should come from tools: React Router `+types`, Drizzle SQL/meta snapshots, Durable Object migration wrappers such as `drizzle/migrations.js`, lockfile changes, and `.alchemy/` state. If generated output needs to change, edit the source of truth and run the generator.

## Best practices and optimizations

This starter kit follows modern 2026 best practices:

### Type safety
- **Shared TypeScript config**: `tsconfig.base.json` across packages
- **Strict TypeScript**: Additional checks where enabled (`noUncheckedIndexedAccess`, etc.)
- **Types**: **`env.d.ts`** per worker package (Alchemy-derived; see [agents/skills/cf-starter-workflow/SKILL.md](agents/skills/cf-starter-workflow/SKILL.md)); React Router types under `.react-router/` (gitignored)

### Code quality
- **Biome** for lint + format
- **Turborepo**: Declared `inputs` / `outputs` / `env` so unchanged work **hits the cache** on repeat runs (except `dev` and `clean`)

### Git hooks
If you use pre-commit hooks in your fork, wire them to `bun run lint` / `typecheck` as you prefer — this template does not enforce a specific hook framework.

### Performance
- **103 Early Hints**: CSS preloading for faster initial page loads
- **Smart Placement**: Workers automatically deployed to optimal global locations
- **Aggressive Code Splitting**: Vendor chunks split for better caching
- **Streaming SSR**: React Router 7 streams HTML for faster TTFB

### Dependency management
- **Lock file**: `bun.lock` for reproducible installs
- Optional: add Renovate or Dependabot in your fork for automated bumps

### Observability
- **Cloudflare Logs**: Enabled for all workers and DOs
- **CPU Limits**: Configured to catch runaway executions early
- **Observability Dashboard**: View real-time metrics in Cloudflare dashboard

## Technologies

- **[Cloudflare Workers](https://workers.cloudflare.com/)** - Edge runtime
- **[Durable Objects](https://developers.cloudflare.com/durable-objects/)** - Stateful serverless
- **[React Router 7](https://reactrouter.com/)** - Full-stack React framework
- **[Hono](https://hono.dev/)** - Fast web framework for Workers
- **[Zod](https://zod.dev/)** - Schema validation
- **[Turborepo](https://turbo.build/repo)** - Monorepo build system
- **[Biome](https://biomejs.dev/)** - Fast linter & formatter
- **[Bun](https://bun.sh/)** - Fast package manager & runtime

## Contributing

Bug reports, doc fixes, and improvements that keep the template honest for day-to-day use are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for PR expectations and quality checks (setup and stack details stay in this README).

## License

MIT
