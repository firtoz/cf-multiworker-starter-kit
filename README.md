# Cloudflare Multi-Worker Starter Kit

[![GitHub: use this template](https://img.shields.io/badge/GitHub-use%20this%20template-24292e?logo=github)](https://github.com/your-org/cloudflare-multiworker-template/generate)
[![License: MIT](https://img.shields.io/badge/license-MIT-22c55e)](https://github.com/your-org/cloudflare-multiworker-template/blob/main/README.md#license)

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/workers/)
[![Durable Objects](https://img.shields.io/badge/Durable%20Objects-1e293b?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/durable-objects/)
[![Turborepo](https://img.shields.io/badge/Turborepo-EF4444?logo=turbo&logoColor=white)](https://turbo.build/)
[![React Router](https://img.shields.io/badge/React%20Router-7-121212?logo=react&logoColor=61DAFB)](https://reactrouter.com/)
[![Bun](https://img.shields.io/badge/Bun-000000?logo=bun&logoColor=fff)](https://bun.sh/)
[![Hono](https://img.shields.io/badge/Hono-E36002?logo=hono&logoColor=white)](https://hono.dev/)
[![Alchemy](https://img.shields.io/badge/Alchemy-infra%20as%20code-7c3aed)](https://alchemy.run/)

![Cloudflare Multi-worker Starter Kit: Monorepo for full-stack Cloudflare Workers & Durable Objects, type safety, ready to ship](docs/branding/banner.jpg)

A production-minded starter for full-stack Cloudflare apps: React Router on Workers, Durable Objects, D1, Drizzle, Hono, typed bindings, Turborepo, and Alchemy deploys. Copy it, rename it, ship it. The demo covers SSR, D1, service bindings, Durable Objects, and WebSockets.
## What you get

- **React Router 7 on Workers** — streaming SSR, Tailwind, typed loaders/actions, form actions.
- **Durable Object examples** — Hono RPC-style access, service bindings, Socka WebSockets (`/chat`).
- **D1 + Drizzle** — generated migrations and a `/visitors` route.
- **Typed bindings** — package-local `alchemy.run.ts` → Worker `env` types.
- **Deploy story** — Turbo + Alchemy, staging/production, PR previews (details below only when you need them).

## When you need more

| Goal | Where |
|------|--------|
| Web routes, SSR, bindings, forms | [`apps/web/README.md`](apps/web/README.md) |
| GitHub Environments, rulesets, what runs in CI, custom domains | [`docs/github-admin.md`](docs/github-admin.md) |
| `.env.local` / staging / prod secrets | [`.env.example`](.env.example) · [`agents/skills/cf-workers-env-local/SKILL.md`](agents/skills/cf-workers-env-local/SKILL.md) |
| Full rebrand (package names, UI copy) | [`agents/skills/project-init/SKILL.md`](agents/skills/project-init/SKILL.md) |
| Typegen cadence, Turbo deploy order, generated artifacts | [`agents/skills/multiworker-workflow/SKILL.md`](agents/skills/multiworker-workflow/SKILL.md) |
| Cursor / IDE rules look wrong after clone | `bun run agents:link` · [`agents/README.md`](agents/README.md) |

**Bun:** use the version in root [`package.json`](package.json) → `packageManager` (CI matches it).

## Quick start

**Prerequisites:** [Bun](https://bun.sh/) (see `packageManager` above), git, a [Cloudflare](https://dash.cloudflare.com/) account for local Alchemy resources.

Create a repo from the template:

```bash
gh repo create my-project --template your-org/cloudflare-multiworker-template --public
cd my-project
```

Or **Use this template** on the [GitHub repository](https://github.com/your-org/cloudflare-multiworker-template) (replace `your-org` with the template owner).

### Run locally

```bash
bun run quickstart
```

That installs dependencies if `node_modules` is missing, fills **missing** regeneratable keys in `.env.local`, runs a dev preflight, then starts the dev stack. It does **not** rotate existing secrets.

On a new machine you may need Alchemy linked to Cloudflare **once**:

```bash
bun alchemy configure
bun alchemy login
```

Then rerun **`bun run quickstart`** (or **`bun run dev`** if `.env.local` is already set).

Open the URL Vite prints (often `http://localhost:5173`). Try **`/`**, **`/visitors`**, **`/ping-do`**, **`/chat`**.

### Deploy with GitHub Actions (optional)

Before meaningful deploys, [name your product](#name-your-product) so Cloudflare/Alchemy names match your app.

You need a Cloudflare **API token** and **Account ID** from the dashboard (this template does not create tokens — [step-by-step](docs/github-admin.md#cloudflare-credentials-manual)). Put them in **`.env.staging`** / **`.env.production`** (or use **`bun run setup:staging`** / **`setup:prod`**). Token and account must be the **same** Cloudflare account.

With [`gh`](https://cli.github.com/) authenticated and repo admin rights, from a trusted machine:

```bash
bun run onboard:staging   # sync staging → push/merge to `main` deploys staging after CI
bun run onboard:prod      # sync production → deploys from `production` branch (see docs)
```

**`bun run github:setup`** prints a fuller Actions checklist. Workflow behavior, **`DEPLOY_ENABLED`**, fork vs same-repo PR previews, rulesets, and **`AUTO_PRODUCTION_PR`**: [`docs/github-admin.md`](docs/github-admin.md).

### If setup fails

- **Local:** Alchemy auth — `bun alchemy configure`, `bun alchemy login`; optional `CLOUDFLARE_*` in `.env.local`. Missing generated secrets — `bun run setup:local` or rerun **`quickstart`**.
- **`onboard:staging`:** Cloudflare lines in `.env.staging` or **`setup:staging`**; **`gh auth login`**.
- **`onboard:prod`:** same for `.env.production`, or **`ONBOARD_PROD_COPY_CF=1`** to copy token/account from `.env.staging` (non-interactive).
- **Wrong account:** token and Account ID must match the same Cloudflare account.

## Name your product

### Code-first infra names

**Alchemy app ids** (e.g. `skybook-frontend`, `skybook-database`) come from one place:

1. Set **`PRODUCT_PREFIX`** in [`packages/alchemy-utils/src/worker-peer-scripts.ts`](packages/alchemy-utils/src/worker-peer-scripts.ts) (default `starter` → your slug).
2. Run **`bun run typegen`**.
3. Adjust visible product copy when you want.

**Workspace package names** and Turbo **`--filter`** values (e.g. `@internal/web`) are separate from those ids. Full checklist: [`agents/skills/project-init/SKILL.md`](agents/skills/project-init/SKILL.md).

## Deploy

Use gitignored stage files from the repo root:

```bash
bun run setup:staging
bun run deploy:staging

bun run setup:prod
bun run deploy:prod
```

Each command runs the **full** Turbo graph (shared Alchemy state, D1 + migrations, workers/DOs, then the web app with bindings). Required keys: [`.env.example`](.env.example). Keep **`ALCHEMY_PASSWORD`** the same everywhere that stage deploys (local, CI, teammates).

**Custom domains** (`WEB_*` env vars): [`docs/github-admin.md`](docs/github-admin.md#custom-domains-web-worker).

**Optional PostHog:** leave keys empty to stay dark; wiring/removal notes: [`apps/web/README.md`](apps/web/README.md#optional-posthog).

## Project layout

```text
├── apps/
│   └── web/                    # React Router app + Worker entry
├── durable-objects/
│   ├── chatroom-do/
│   ├── ping-do/
│   └── other-worker/
├── packages/
│   ├── alchemy-utils/          # PRODUCT_PREFIX, app ids, alchemy-cli
│   ├── chat-contract/
│   ├── db/                     # D1 schema + Drizzle migrations
│   ├── scripts/                # quickstart, setup, onboard, GitHub sync helpers
│   └── state-hub/              # shared CI Alchemy state
├── stacks/                     # admin / GitHub sync (Alchemy)
├── agents/                     # AI rules + skills (human playbooks too)
├── .cursor/                    # Cursor env + symlinks to agents/
└── .claude/                    # optional Claude Code symlinks
```

**Entry points:** `apps/web/alchemy.run.ts`, `apps/web/workers/app.ts`, `packages/db/src/schema.ts`, `packages/alchemy-utils/src/worker-peer-scripts.ts`.

## Working in the repo

From the repo root:

```bash
bun run typegen
bun run typecheck
bun run lint
bun run build
```

Run **`typegen`** after routes, `alchemy.run.ts`, or binding/env changes. Run **`bun run db:generate`** after editing `packages/db/src/schema.ts`. Do not hand-edit Drizzle SQL/snapshots, React Router `+types`, or `.alchemy/`.

Bindings in app code:

```typescript
import { env } from "cloudflare:workers";
```

Do not read Worker bindings from React Router loader/action `context` in this repo.

## Adding workers

```bash
bunx turbo gen durable-object
```

Then: add the package to root **`dev`** filters if it should run locally; fix **`turbo.json`** deploy/destroy order as needed; add a workspace dep from **`apps/web`** if the web app uses it; import its **`./alchemy`** from **`apps/web/alchemy.run.ts`**; run **`bun run typegen`** and **`bun run typecheck`**.

Details: [`agents/skills/cf-durable-object-package/SKILL.md`](agents/skills/cf-durable-object-package/SKILL.md), [`agents/skills/cf-web-alchemy-bindings/SKILL.md`](agents/skills/cf-web-alchemy-bindings/SKILL.md), [`agents/skills/cf-worker-rpc-turbo/SKILL.md`](agents/skills/cf-worker-rpc-turbo/SKILL.md).

## Common scripts

| Area | Commands |
|------|----------|
| Dev | `dev`, `quickstart`, `build`, `typegen`, `typecheck`, `lint`, `clean` |
| Deploy | `deploy:staging`, `deploy:prod`, `deploy:preview`, `destroy:*`, `deploy:preflight:*` |
| GitHub Environments | `github:setup`, `github:sync:staging`, `github:sync:prod`, `github:sync`, `github:env:*`, `github:sync:config` |
| DB | `db:generate`, `check:drizzle-generated` |

More context: [`agents/skills/multiworker-workflow/SKILL.md`](agents/skills/multiworker-workflow/SKILL.md), [`docs/github-admin.md`](docs/github-admin.md).

## Deeper docs

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — PRs and checks.
- [`AGENTS.md`](AGENTS.md) — index for AI assistants; **`agents/skills/`** are deep playbooks (optional for humans).

## Stack

[Cloudflare Workers](https://workers.cloudflare.com/) + [Durable Objects](https://developers.cloudflare.com/durable-objects/) + [React Router 7](https://reactrouter.com/) + [Hono](https://hono.dev/) + [D1](https://developers.cloudflare.com/d1/) + [Drizzle](https://orm.drizzle.team/) + [Turborepo](https://turbo.build/repo) + [Alchemy](https://alchemy.run/) + [Biome](https://biomejs.dev/) + [Bun](https://bun.sh/) + [Zod](https://zod.dev/).

## Security posture

Real infra + demo routes: treat as a starting point. **This** repository’s stock workflows use GitHub Environments for **same-repo** PR previews (**`staging`**), production deploys from **`production`**, and guardrails so **fork** PRs never receive preview deploy secrets. Add your own auth, CSP, rate limits, and least-privilege tokens before launch. See [`docs/github-admin.md`](docs/github-admin.md) and [`agents/skills/cf-workers-env-local/SKILL.md`](agents/skills/cf-workers-env-local/SKILL.md).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

MIT
