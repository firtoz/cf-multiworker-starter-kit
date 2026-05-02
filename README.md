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
[![Alchemy](https://img.shields.io/badge/Alchemy-infra%20as%20code-7c3aed)](https://alchemy.run/)

![Cloudflare Multi-worker Starter Kit: Monorepo for full-stack Cloudflare Workers & Durable Objects, type safety, ready to ship](docs/branding/banner.jpg)

A production-minded starter for full-stack Cloudflare apps: React Router on Workers, Durable Objects, D1, Drizzle, Hono, typed bindings, Turborepo, and Alchemy deploys.

It is meant to be copied, renamed, and shipped. The sample app includes enough real pieces to prove the stack works: SSR, D1, service bindings, Durable Objects, and WebSockets.

<p align="center">
  <a href="https://peerlist.io/firtoz/project/cloudflare-multiworker-starter-kit" target="_blank" rel="noreferrer">
    <img
      src="https://peerlist.io/api/v1/projects/embed/PRJHA9E6LDQG9KQKD1AJB9M7OM6B7B?showUpvote=true&theme=dark"
      alt="Cloudflare Multi-Worker Starter Kit"
      height="72"
    />
  </a>
</p>

## What You Get

- **React Router 7 on Cloudflare Workers** with streaming SSR, Tailwind, typed loaders/actions, form actions, and 103 Early Hints.
- **Durable Object examples** for Hono RPC-style access, service bindings, and realtime WebSockets with `@firtoz/socka`.
- **D1 + Drizzle** with generated migrations and a working `/visitors` route.
- **Typed infrastructure bindings** from package-local `alchemy.run.ts` files into Worker `env.d.ts` types.
- **Monorepo deploys** with Turborepo and Alchemy, including staging, production, and PR preview stacks.
- **A generator** for adding more `durable-objects/*` packages.

## Quick Start

Prerequisites: [Bun](https://bun.sh/), git, and a [Cloudflare](https://dash.cloudflare.com/) account for local Alchemy resources.

Create a repo from the template:

```bash
gh repo create my-project --template firtoz/cf-multiworker-starter-kit --public
cd my-project
```

Or use **Use this template** from the [GitHub repo](https://github.com/firtoz/cf-multiworker-starter-kit).

Install dependencies and create local secrets:

```bash
bun install
bun run setup
```

Connect Alchemy to Cloudflare on each new machine:

```bash
bun alchemy configure
bun alchemy login
```

Then start the full local stack:

```bash
bun run dev
```

Open the URL printed by Vite/Alchemy, usually `http://localhost:5173`.

Try these routes:

- `/` for the web app.
- `/visitors` for D1 + Drizzle.
- `/ping-do` for a Durable Object binding.
- `/chat` for WebSockets through the web worker into the chatroom Durable Object.

### If Setup Fails

- Missing Cloudflare credentials: run `bun alchemy configure` and `bun alchemy login`, or add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` to `.env.local`.
- Missing secrets: rerun `bun run setup`, or set `ALCHEMY_PASSWORD` and `CHATROOM_INTERNAL_SECRET` in `.env.local`.
- Cloudflare account errors: make sure `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` belong to the same account.

## Name Your Product

Before meaningful deploys, rename the starter so Cloudflare dashboards and Alchemy app names match your app.

Fast path:

1. Change `PRODUCT_PREFIX` in `packages/alchemy-utils/worker-peer-scripts.ts` from `cf-starter` to your slug, for example `skybook`.
2. Run `bun run typegen`.
3. Update visible product copy when you are ready.

That prefix drives Alchemy app names such as `skybook-frontend`, `skybook-database`, and `skybook-chatroom`. Workspace package names and Turbo filters are separate; see [agents/skills/project-init/SKILL.md](agents/skills/project-init/SKILL.md) for the full rebrand checklist.

## Deploy

Local deploy commands use gitignored stage env files:

```bash
bun run setup:staging
bun run deploy:staging

bun run setup:prod
bun run deploy:prod
```

Each deploy runs the full Turbo graph, not just the web app. In order, it prepares shared Alchemy state, deploys D1 and migrations, deploys Worker and Durable Object packages, then deploys the web app with bindings to those resources.

Required deploy values are documented in [`.env.example`](.env.example):

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `ALCHEMY_PASSWORD`
- `ALCHEMY_STATE_TOKEN` for CI deploy state
- `CHATROOM_INTERNAL_SECRET`

For one stage, keep `ALCHEMY_PASSWORD` stable everywhere that stage deploys: local machines, CI, and any shared deploy environment.

### Custom domains (web Worker)

The React Router app is deployed as the **frontend** Worker in [`apps/web/alchemy.run.ts`](apps/web/alchemy.run.ts). By default it uses Cloudflare **`workers.dev`** only.

To bind your own hostnames (production or staging):

1. Run `bun run setup:prod` or `bun run setup:staging` and use the **optional** entries at the bottom of the menu — or set the same keys in `.env.production` / `.env.staging` (see [`.env.example`](.env.example)).
2. Typical: set **`WEB_DOMAINS=example.com,www.example.com`**. Use **`WEB_ROUTES`** only if you need explicit route patterns (e.g. `example.com/*`).
3. Optional: **`WEB_ZONE_ID`** (apply one zone to every entry), **`WEB_DOMAIN_OVERRIDE_EXISTING_ORIGIN=true`** when moving a hostname from another Worker.
4. For CI, run `bun run github:sync:prod` / `github:sync:staging` after editing the stage dotfile so GitHub Environment **variables** include the `WEB_*` keys (they are not secrets).

PR preview stacks use `STAGE=pr-<n>` and stay on **`workers.dev`**: `WEB_*` values are **ignored** during preview deploys so shared GitHub Environment variables never bind your real hostnames to PR stacks.

### GitHub Actions Deploys

Deploy workflows are disabled by default on fresh forks. They stay green and skip Alchemy until `CF_STARTER_DEPLOY_ENABLED=true` is set on the GitHub Environment.

Use the setup helpers from a trusted machine:

```bash
bun run github:setup
bun run setup:staging
bun run setup:prod

gh auth login
bun run github:sync:staging
bun run github:sync:prod
```

What runs in CI:

- **Quality checks** run on pushes and PRs to `main`: generated-artifact guard, typecheck, lint, seeded `.env.local`, and build.
- **Staging deploys** run after Quality checks pass on a push to `main`.
- **Production deploys** run from the `production` branch or manually from the Actions UI.
- **PR previews** deploy for PRs into `main` and tear down when the PR closes.

After a successful deploy, the Actions Summary shows the deployed `workers.dev` URL.

## Project Layout

```text
├── apps/
│   └── web/                    # React Router app and Cloudflare Worker entry
├── durable-objects/
│   ├── chatroom-do/            # Socka WebSocket Durable Object
│   ├── ping-do/                # Hono Durable Object example
│   └── other-worker/           # Plain Worker service-binding example
├── packages/
│   ├── alchemy-utils/          # Product prefix, app ids, deploy helpers
│   ├── chat-contract/          # Shared chat protocol types
│   ├── db/                     # D1 schema and Drizzle migrations
│   ├── scripts/                # Setup and maintenance scripts
│   └── state-hub/              # Shared CI Alchemy state bootstrap
├── agents/                     # AI rules and stack-specific playbooks
├── .cursor/                    # Cursor symlinks and environment setup
└── .claude/                    # Optional Claude Code symlinks
```

Important entry points:

- `apps/web/alchemy.run.ts` wires the web worker and imported bindings.
- `apps/web/workers/app.ts` is the web Worker entry.
- `packages/db/src/schema.ts` is the D1 schema source of truth.
- `packages/alchemy-utils/worker-peer-scripts.ts` owns product/app naming.
- `agents/skills/` contains detailed project playbooks.

## Working In The Repo

Run common checks from the repo root:

```bash
bun run typegen
bun run typecheck
bun run lint
bun run build
```

Use `bun run typegen` after changing routes, `alchemy.run.ts`, bindings, or env types.

Use `bun run db:generate` after changing `packages/db/src/schema.ts`. Do not hand-edit Drizzle SQL, Drizzle snapshot JSON, React Router `+types`, lockfiles, or `.alchemy/` state.

For app code that reads Worker bindings, use the Workers virtual module:

```typescript
import { env } from "cloudflare:workers";
```

Do not read bindings from React Router loader/action context in this project.

## Adding More Workers

Generate a new Durable Object package:

```bash
bunx turbo gen durable-object
```

Then wire it into the monorepo:

1. Add the package to the root `dev` filters if it should run locally.
2. Add deploy/destroy ordering where needed in `turbo.json`.
3. Add a workspace dependency from `apps/web` if the web app consumes it.
4. Import its `./alchemy` export from `apps/web/alchemy.run.ts`.
5. Run `bun run typegen` and `bun run typecheck`.

For the detailed checklist, use [agents/skills/cf-durable-object-package/SKILL.md](agents/skills/cf-durable-object-package/SKILL.md), [agents/skills/cf-web-alchemy-bindings/SKILL.md](agents/skills/cf-web-alchemy-bindings/SKILL.md), and [agents/skills/cf-worker-rpc-turbo/SKILL.md](agents/skills/cf-worker-rpc-turbo/SKILL.md).

## Scripts

### Development

- `bun run dev`: run the local web app, D1 package, and Worker/Durable Object packages through Turbo.
- `bun run build`: build local targets.
- `bun run typegen`: generate React Router and Worker binding types.
- `bun run typecheck`: typecheck packages.
- `bun run lint`: run Biome through Turbo.
- `bun run clean`: remove `node_modules` and build artifacts.

### Deploy

- `bun run deploy:staging`: deploy staging with `.env.staging`.
- `bun run deploy:prod`: deploy production with `.env.production`.
- `bun run deploy:preview`: deploy a preview stack. CI normally provides `STAGE=pr-<number>`.
- `bun run destroy:staging` / `destroy:prod` / `destroy:preview`: destroy matching stacks.
- `bun run deploy:preflight:*`: check whether deploys are enabled and configured.
- `bun run github:setup`: print GitHub Actions onboarding steps.
- `bun run github:sync:staging` / `github:sync:prod`: sync GitHub Environment secrets and variables from a trusted machine.

### Codegen And Dependencies

- `bun run db:generate`: regenerate D1 Drizzle migrations from `packages/db/src/schema.ts`.
- `bun run check:drizzle-generated`: check generated Drizzle artifacts in CI.
- `bun run outdated`: show outdated workspace dependencies.
- `bun run update:interactive`: interactive dependency updates.

## Deeper Docs

- [apps/web/README.md](apps/web/README.md): web app routes, SSR, and frontend patterns.
- [AGENTS.md](AGENTS.md): short index for AI agents and project playbooks.
- [agents/skills/cf-starter-workflow/SKILL.md](agents/skills/cf-starter-workflow/SKILL.md): repo commands, typegen, deploy order, and generated artifacts.
- [agents/skills/cf-workers-env-local/SKILL.md](agents/skills/cf-workers-env-local/SKILL.md): `.env.local`, `.env.staging`, `.env.production`, and secrets.
- [agents/skills/cf-socka-realtime/SKILL.md](agents/skills/cf-socka-realtime/SKILL.md): WebSockets and realtime Durable Object patterns.
- [CONTRIBUTING.md](CONTRIBUTING.md): contribution expectations.

## Stack

[Cloudflare Workers](https://workers.cloudflare.com/) + [Durable Objects](https://developers.cloudflare.com/durable-objects/) + [React Router 7](https://reactrouter.com/) + [Hono](https://hono.dev/) + [D1](https://developers.cloudflare.com/d1/) + [Drizzle](https://orm.drizzle.team/) + [Turborepo](https://turbo.build/repo) + [Alchemy](https://alchemy.run/) + [Biome](https://biomejs.dev/) + [Bun](https://bun.sh/) + [Zod](https://zod.dev/).

## Security posture (for template users)

This kit ships with real infra and demos. Treat security as layering: tighten what ships by default, then add product-specific controls when you graduate past the template.

**What’s reasonably locked down here**

| Area | Behavior |
| ---- | -------- |
| **GitHub Actions** | Workflows declare least-privilege `permissions` where it matters (`contents: read`, `pull-requests: read`, `issues: write` for PR preview comments). **`pull_request` runs the workflow YAML from `main`**—fork PRs cannot silently replace Actions logic until their branch is merged. |
| **PR preview deploy** | **Deploy** and **destroy preview** jobs use GitHub Environment **`staging`**. Turn on **Required reviewers** (or wait timers) on that environment so a human approves the **workflow deployment** in Actions — not a PR review — which works for bot/agent–authored PRs. Teardown checks out the **`base` branch** so **`bun install` does not execute untrusted `package.json` scripts** during destroy. The bot upserts one PR comment (no deploy secrets attached). |
| **Production manual deploy** | `workflow_dispatch` is rejected unless **`GITHUB_REF` is `refs/heads/production`** so Operators cannot accidentally run prod deploy against an arbitrary branch. |
| **`/api/worker-services`** | Demo probe is **GET-only** and returns **health metadata only**—not full downstream Worker response bodies (reduces leakage and scraper value). |
| **Demo chat** | Socka contract caps **display name length** (including **`?name=` on the WebSocket URL**) and **message body length**. History responses clamp legacy DB rows so oversized rows do not break the wire contract. |
| **Headers + fonts** | Baseline **`Referrer-Policy`**, **`Permissions-Policy`**, **`X-Frame-Options`**. UI fonts are **self-hosted variable** DM Sans / Fira Code (`@fontsource-variable/*`) via **`<link rel="preload">` in `links()` plus `font-display: swap`** — reduces reload “twitch” without Google Fonts. |

**What stays intentionally lightweight (demo)**

- **Public demos**: `/chat`, `/visitors`, `/ping-do`, and the Socka **`clearHistory`** path are trusts-everyone examples—fine for showcases, weak for moderation or tenancy.
- **PR preview economics**: Approved preview deploy **still checks out PR head**—`bun install` and any postinstall/run scripts can execute. Keep **narrow Cloudflare tokens** scoped to Workers/D1 previews, consider **additional GitHub Environment protection rules**, and treat preview secrets as disposable.
- **No strict Content-Security-Policy yet**: SSR + React bundles need careful nonces/hashes before turning on CSP in production—plan that when you freeze third-party origins.

**If you fork for production**

Add what your threat model demands: authenticated admin surfaces, structured logging, CSP + security headers tuning, outbound abuse controls (especially on WebSockets and public writes), tighter Cloudflare account/IAM segmentation, OIDC/GitHub deployments instead of long-lived tokens, dependency review/supply-chain checks, secrets rotation, rate limits/WAF tuning, etc.

See also [agents/skills/cf-workers-env-local/SKILL.md](agents/skills/cf-workers-env-local/SKILL.md) for env and secret hygiene across stages.

## Contributing

Bug reports, doc fixes, and improvements that keep the template honest for day-to-day use are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
