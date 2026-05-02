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
- **Optional PostHog-oriented analytics** — env keys and client helpers only; disabled until you set `POSTHOG_*` / wire the UI. Remove entirely if you do not want product analytics (same as ripping out any other demo feature).

## Quick Start (three lanes)

This repo separates **local dev**, **staging on GitHub Actions**, and **production**. Pick one path at a time.

**Prerequisites:** [Bun](https://bun.sh/), git, and a [Cloudflare](https://dash.cloudflare.com/) account for Alchemy local resources.

Create a repo from the template:

```bash
gh repo create my-project --template firtoz/cf-multiworker-starter-kit --public
cd my-project
```

Or use **Use this template** from the [GitHub repo](https://github.com/firtoz/cf-multiworker-starter-kit).

### Lane A — Local dev

One command installs if needed, fills **missing** regeneratable keys in `.env.local` (it does **not** rotate existing secrets), runs a dev preflight, then starts Turbo dev:

```bash
bun run quickstart
```

On a fresh machine you may still need Alchemy linked to Cloudflare **once**:

```bash
bun alchemy configure
bun alchemy login
```

Then rerun **`bun run quickstart`** (or **`bun run dev`** directly when `.env.local` is already good).

Open the URL printed by Vite/Alchemy, usually `http://localhost:5173`.

Try these routes:

- `/` for the web app.
- `/visitors` for D1 + Drizzle.
- `/ping-do` for a Durable Object binding.
- `/chat` for WebSockets through the web worker into the chatroom Durable Object.

### Lane B — Staging (CI on `main`)

**Trigger:** after **Quality checks** succeed, **Deploy staging** runs on a successful **push** to **`main`** (same commit as the Quality run — not PR-only runs). Merge to `main` or push to `main` to ship staging.

**Human prerequisite:** a Cloudflare **API token** and **Account ID** (see [Cloudflare credentials (manual)](#cloudflare-credentials-manual) below). This template does **not** create tokens for you.

From a **trusted machine** with [`gh`](https://cli.github.com/) installed:

```bash
bun run onboard:staging
```

That verifies **`gh auth`**, ensures `.env.staging` has Cloudflare values, runs **`bun run setup:staging -- --yes`** (generated secrets only where missing), then **`bun run github:sync:staging`**. The command is **idempotent** — safe to rerun.

Then **push or merge to `main`**; when Quality checks pass, staging deploys.

### Lane C — Production (`production` branch)

**Trigger:** pushes to branch **`production`** (see `.github/workflows/deploy-production.yml`). Typical flow: PR **`main` → `production`**, merge to deploy.

Onboard production (same idea as staging; can **reuse** the same Cloudflare token and account ID when prod lives in the same account):

```bash
bun run onboard:prod
```

That runs **`setup:prod -- --yes`**, **`github:sync:prod`**, and sets repository variable **`CF_STARTER_AUTO_PRODUCTION_PR=true`** so that, **after a successful staging deploy**, Actions may **open or reuse** a PR from **`main`** to **`production`**. You still merge that PR to deploy production. If **`production`** does not exist on the remote yet, create it once (for example from `main`) before relying on automation.

For **rulesets** and merge gates on `main` / `production`, see the [GitHub Actions deploys](#github-actions-deploys) section and [`config/github.policy.ts`](config/github.policy.ts).

### Cloudflare credentials (manual)

Use the dashboard — **no OAuth or scripted token creation** in this repo.

1. **Account ID** — [Cloudflare dashboard](https://dash.cloudflare.com/) → your account → **Workers & Pages** (or account overview). Copy **Account ID**.
2. **API token** — [My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens) → **Create Token**. Fast path: **Edit Cloudflare Workers** template scoped to that account. For tighter scopes, include Workers + **D1** as your deploy needs — see [API tokens](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/).
3. Put **`CLOUDFLARE_API_TOKEN`** and **`CLOUDFLARE_ACCOUNT_ID`** in **`.env.staging`** / **`.env.production`** (or run **`bun run setup:staging`** / **`setup:prod`** and use the Cloudflare category). They must refer to the **same** account.

### If setup fails

- **`quickstart` / local:** missing Alchemy/Cloudflare auth — `bun alchemy configure`, `bun alchemy login`, optional `CLOUDFLARE_*` in `.env.local`; missing generated secrets — `bun run setup:local` or rerun **`bun run quickstart`**.
- **`onboard:staging`:** paste Cloudflare values into `.env.staging` or run **`bun run setup:staging`**; ensure **`gh auth login`**.
- **`onboard:prod`:** same for `.env.production`, or answer the prompt / set **`ONBOARD_PROD_COPY_CF=1`** to copy Cloudflare lines from `.env.staging`.
- **Account mismatch:** `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` must be the same Cloudflare account.

## Name Your Product

Before meaningful deploys, rename the starter so Cloudflare dashboards and Alchemy app names match your app.

Fast path:

1. Change `PRODUCT_PREFIX` in `packages/alchemy-utils/src/worker-peer-scripts.ts` from `cf-starter` to your slug, for example `skybook`.
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
4. For CI, run `bun run github:sync:staging` / `github:sync:prod` (or **`bun run github:sync`** to run both in order) after editing the stage dotfiles so GitHub Environment **variables** include the `WEB_*` keys (they are not secrets).

PR preview stacks use `STAGE=pr-<n>` and stay on **`workers.dev`**: `WEB_*` values are **ignored** during preview deploys so shared GitHub Environment variables never bind your real hostnames to PR stacks.

### Optional: PostHog (product analytics)

This starter may include **optional** PostHog-oriented pieces: typed env keys in [`apps/web/env.requirements.ts`](apps/web/env.requirements.ts), client helpers under `apps/web/app/lib/`, and (when you wire it) Worker vars such as `POSTHOG_KEY` / `POSTHOG_HOST`. **Nothing runs until you set keys and connect the UI** — same philosophy as other sample features you might delete.

- **To stay dark:** leave all `POSTHOG_*` empty in `.env.local` / staging / prod; setup and GitHub sync treat them as optional.
- **To remove completely:** delete the `posthogRequirements` block (or the spread) in `env.requirements.ts`, remove PostHog components/helpers/scripts you are not using, strip related `binding`s from `alchemy.run.ts` if you added any, and drop `@posthog/*` / `posthog-js` from `apps/web/package.json` if present. Optional `sourcemap:upload` is only for uploading maps to PostHog.

### GitHub Actions Deploys

Deploy workflows are disabled by default on fresh forks. They stay green and skip Alchemy until `CF_STARTER_DEPLOY_ENABLED=true` is set on the GitHub Environment.

Use the setup helpers from a trusted machine (see README **Quick Start** — **Lane B** / **Lane C** for the full ladder):

```bash
bun run github:setup

# Idempotent wrappers (rerunnable):
bun run onboard:staging
bun run onboard:prod

# Manual equivalent when you already maintain the dotfiles:
gh auth login
bun run setup:staging
bun run setup:prod
bun run github:sync:staging
bun run github:sync:prod
# or both in one go (requires .env.staging and .env.production):
# bun run github:sync
```

**`onboard:prod`** sets repository variable **`CF_STARTER_AUTO_PRODUCTION_PR=true`** after a successful **`github:sync:prod`**, allowing **Deploy staging** to open or reuse a **`main` → `production`** PR when staging deploy succeeds. Clear the variable with **`gh variable delete`** if you want to turn that off.

To create or update **only** the GitHub Environment **deployment protection** (Alchemy **`RepositoryEnvironment`**) — **no** GitHub **secrets** or **Environment variables** are written — use **`github:env:*`**. Rules come from **[`config/github.policy.ts`](config/github.policy.ts)** (`github.environments.*`). Each command still loads the stage dotfile when present (for `gh` / local process env), but **policy is not driven by `GITHUB_ENV_*` keys**.

```bash
gh auth login
bun run github:env:staging
# or both GitHub environments (each run uses its own dotfile):
# bun run github:env
```

Full secret + variable sync remains **`github:sync:*`** or **`github:sync`** (both stage dotfiles required). **Config-only** (repo REST + **RepositoryEnvironment** shells, **no** secret or Environment variable upload; dotfiles optional): **`bun run github:sync:config`** or set **`GITHUB_SYNC_PUSH_SECRETS=false`** for a normal sync run.

To **also** re-apply **deployment protection** from **`config/github.policy.ts`** while running a secrets sync, set **`GITHUB_SYNC_UPDATE_ENVIRONMENT_PROTECTION=true`** for that run (same payload as **`github:env:*`**).

**Repository rulesets (staging sync only):** when **`github.sync.applyRulesets`** is **true** in **`config/github.policy.ts`**, **`github:sync:staging`** upserts rulesets for **`main`** and **`production`**. By default **`main`** requires a pull request before merge for **Write** / **Maintain** collaborators, while **`allowRepositoryAdminBypassOnMain`** (default **true**) adds a ruleset bypass for the built-in **Repository admin** role so owners/admins can push directly; set **`requirePullRequestBeforeMerge`** to **false** for a fully open `main`. **`github.repository.rulesets.pullRequest.sharedRequiredApprovingReviewCount`** defaults to **0** (solo-friendly merges); raise it when you want mandatory approvals. Optional **status checks** via **`github.repository.rulesets.main.requiredStatusCheckContexts`**. **`production`** uses pull-request rules for **everyone** (no admin bypass in defaults), no force-push, and a **workflows** rule from [`restrict-production-pr-source.yml`](.github/workflows/restrict-production-pr-source.yml). Repo variable **`CF_STARTER_PRODUCTION_PR_HEAD`** is set from **`github.repository.rulesets.production.sourceBranchForProductionPrs`**. See [`stacks/github-repo-rulesets-sync.ts`](stacks/github-repo-rulesets-sync.ts).

### GitHub admin sync reference (env vs policy)

- **Secrets / stage values:** [`.env.staging`](.env.staging) / [`.env.production`](.env.production) and [`packages/scripts/src/repo-root-env-requirements.ts`](packages/scripts/src/repo-root-env-requirements.ts) — Alchemy, Cloudflare, app secrets, optional `WEB_*` / `POSTHOG_*`, and the sync switches below.
- **Repo policy (rulesets, merge settings, Environment rules):** **[`config/github.policy.ts`](config/github.policy.ts)** — edit TypeScript, then run **`bun run typecheck:root`**. Applied during **`github:sync:staging`** (REST + rulesets + staging-side policy) and by **`github:env:*`** (deployment protection only). **`github:sync:prod`** does not repeat REST/ruleset steps.

| Variable | Default if unset / empty | Purpose |
| --- | --- | --- |
| **`GITHUB_SYNC_SCOPE`** | *None — must be set by the script* | **`secrets`** vs **`environment`** (`package.json` sets this for each `github:*` command). |
| **`GITHUB_SYNC_PUSH_SECRETS`** | **`true`** (unset, empty, or whitespace = push) | **`false`** → config-only sync (same as **`github:sync:config`**) |
| **`GITHUB_SYNC_UPDATE_ENVIRONMENT_PROTECTION`** | **`false`** (only **`true`** enables) | On **`github:sync:*`**, also apply **`RepositoryEnvironment`** protection from **`config/github.policy.ts`** |
| **`config/github.policy.ts`** | (tracked defaults in repo) | Repo **settings** API, **rulesets**, and **`staging` / `production` / `staging-fork`** deployment rules — edit **`github.sync.*`** and **`github.environments.*`** |

**Requirements:** token needs **admin** on the repo for rulesets and repo variables. **GitHub Team/Enterprise** feature availability may vary for some ruleset options; see [GitHub rulesets docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets).

**Required CI via rulesets:** set **`github.repository.rulesets.main.requiredStatusCheckContexts`** in **`config/github.policy.ts`** to check **context** strings (confirm exact names from a PR’s checks tab after **Quality checks** has run). Wrong names block merges until fixed or cleared.

What runs in CI:

- **Quality checks** run on pushes and PRs to `main`: generated-artifact guard, typecheck, lint, seeded `.env.local`, and build.
- **Staging deploys** run after Quality checks pass on a push to `main`.
- **Production deploys** run from the `production` branch or manually from the Actions UI.
- **PR previews** (into `main`): **same-repo** PRs use GitHub Environment **`staging`**; **fork** PRs use **`staging-fork`**. Run **`github:sync:staging`** so both get the same secrets/vars and **`staging-fork`** gets **required reviewers** by default per **`github.environments.stagingFork`** in **`config/github.policy.ts`** (empty reviewer lists + **`reviewerFallbackToActor`** → current **`gh`** login or **`GITHUB_ACTOR`**). Leave **`staging`** open if you want internal branch PRs to preview without that gate.

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
- `packages/alchemy-utils/src/worker-peer-scripts.ts` owns product/app naming.
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
- `bun run github:sync:staging` / `github:sync:prod`: sync GitHub Environment secrets and variables from the stage dotfile (`GITHUB_SYNC_SCOPE=secrets` is set by the script).
- `bun run github:sync`: run **`github:sync:staging`** then **`github:sync:prod`** (fails if either dotfile is missing).
- `bun run github:env:staging` / `github:env:prod`: same **`stacks/admin.ts`** with **`GITHUB_SYNC_SCOPE=environment`** — updates GitHub Environment deployment rules only from **`config/github.policy.ts`**; merges the stage dotfile when present for local env only.
- `bun run github:env`: run **`github:env:staging`** then **`github:env:prod`**.

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
| **GitHub Actions** | Workflows declare least-privilege `permissions` where it matters. PR preview deploys run on `pull_request` with read permissions and upload a sanitized comment payload; **`pr-preview-comment.yml`** runs later on `workflow_run` with `issues: write` to post/update the PR comment, including fork PRs, without running fork code with a write token. **`pull_request` runs the workflow YAML from `main`**—fork PRs cannot silently replace Actions logic until their branch is merged. |
| **PR preview deploy** | **Same-repo** PRs (branch on this repo) use **`staging`** — leave deployment protection open there for fast previews if you want. **Fork** PRs use **`staging-fork`** — **`github:sync:staging`** mirrors secrets/vars and applies **required reviewers** there by default per **`github.environments.stagingFork`** in **`config/github.policy.ts`** (see **`packages/scripts/src/github-pr-preview-fork-policy.ts`** and **`stacks/github-repository-environment-from-env.ts`**). Tighten **`staging`** / **`production`** Environment rules in the policy file or run **`bun run github:env:*`**. Teardown checks out **`base`** so **`bun install` does not run untrusted `package.json` scripts** during destroy. |
| **Production manual deploy** | `workflow_dispatch` is rejected unless **`GITHUB_REF` is `refs/heads/production`** so Operators cannot accidentally run prod deploy against an arbitrary branch. |
| **`/api/worker-services`** | Demo probe is **GET-only** and returns **health metadata only**—not full downstream Worker response bodies (reduces leakage and scraper value). |
| **Demo chat** | Socka contract caps **display name length** (including **`?name=` on the WebSocket URL**) and **message body length**. History responses clamp legacy DB rows so oversized rows do not break the wire contract. |
| **Headers + fonts** | Baseline **`Referrer-Policy`**, **`Permissions-Policy`**, **`X-Frame-Options`**. UI fonts are **self-hosted variable** DM Sans / Fira Code (`@fontsource-variable/*`) via **`<link rel="preload">` in `links()` plus `font-display: swap`** — reduces reload “twitch” without Google Fonts. |

**What stays intentionally lightweight (demo)**

- **Public demos**: `/chat`, `/visitors`, `/ping-do`, and the Socka **`clearHistory`** path are trusts-everyone examples—fine for showcases, weak for moderation or tenancy.
- **PR preview economics**: After a human allows the environment deploy, preview **still checks out PR head**—`bun install` and any postinstall/run scripts can execute. Keep **narrow Cloudflare tokens** scoped to Workers/D1 previews, consider **additional GitHub Environment protection rules**, and treat preview secrets as disposable.
- **No strict Content-Security-Policy yet**: SSR + React bundles need careful nonces/hashes before turning on CSP in production—plan that when you freeze third-party origins.

**If you fork for production**

Add what your threat model demands: authenticated admin surfaces, structured logging, CSP + security headers tuning, outbound abuse controls (especially on WebSockets and public writes), tighter Cloudflare account/IAM segmentation, OIDC/GitHub deployments instead of long-lived tokens, dependency review/supply-chain checks, secrets rotation, rate limits/WAF tuning, etc.

See also [agents/skills/cf-workers-env-local/SKILL.md](agents/skills/cf-workers-env-local/SKILL.md) for env and secret hygiene across stages.

## Contributing

Bug reports, doc fixes, and improvements that keep the template honest for day-to-day use are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
