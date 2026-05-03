---
name: cf-workers-env-local
description: Alchemy + env files — repo-root `.env.local` (dev), `.env.staging` (staging / PR preview deploys), `.env.production` (prod / CI), optional per-package `.env.local`, and package-local Alchemy apps. Use when adding secrets or non-secret vars, debugging missing env in local dev, or local vs prod typegen. Never use a plain `.env` file. `.env.example` is human documentation only — no script reads it for all keys.
---

# Alchemy — env files and package apps

## When to use this skill

- Adding, renaming, or documenting environment variables for the web worker, chatroom worker, or D1.
- Local dev shows missing vars for Alchemy (each app uses **`alchemy-cli.ts dev <ALCHEMY_APP_IDS key>`** → **`alchemy dev --app <id>`**; see [Alchemy Turborepo](https://alchemy.run/guides/turborepo/)).
- Choosing **local** (`typegen:local` / `typecheck:local`) vs **prod** (`typegen:prod` / `typecheck:prod`) for CI.
- Explaining **repo-root** `.env.local` + `.env.staging` + `.env.production` vs optional per-package `.env.local`.

## Fork onboarding (humans)

After cloning or generating from the template, follow **README *Quick start***:

- **`bun run quickstart`** — install if needed, `.env.local` regeneratable keys, then **`bun run dev`**
- **`bun run onboard:staging`** — **`gh`**, **`.env.staging`** Cloudflare keys, **`setup:staging --yes`**, **`github:sync:staging`**
- **`bun run onboard:prod`** — production dotfile flow, **`github:sync:prod`**, repo variable **`AUTO_PRODUCTION_PR`**

Create **Cloudflare API tokens** only in the dashboard ([`docs/github-admin.md`](../../docs/github-admin.md#cloudflare-credentials-manual)); this repo does not mint tokens via scripts or OAuth.

## Ground rules

1. **`.env.example` (repo root, optional `apps/web/.env.example`)** — **Human documentation only** for most keys. Root **`bun run dev`** and package dev scripts read the real **`.env.local`**; Alchemy docs cover [Secrets](https://alchemy.run/providers/cloudflare/secret/) and [State](https://alchemy.run/concepts/state/).

2. **Real env** — Put dev values in **`.env.local`** (gitignored).
   - **`.env.staging`** — staging + PR preview deploys (`STAGE=staging` or `STAGE=pr-<n>`).
   - **`.env.production`** — production (`STAGE=prod`).
   - **Never** use a plain **`.env`** file.
   - **`POSTHOG_*`** — optional analytics; same idea as optional **`WEB_*`** (unset = dark, or remove scaffolding — root README).

3. **`ALCHEMY_PASSWORD`**, **`ALCHEMY_STATE_TOKEN`**, and CI — Two different concerns; both matter for deploys.
   - **`ALCHEMY_PASSWORD`** must match on **every** **`alchemy deploy`** for that stage ([encryption password](https://alchemy.run/concepts/secret/#encryption-password)).
   - **`ALCHEMY_STATE_TOKEN`** is one stable token per Cloudflare account for the [Cloudflare-backed Alchemy state store](https://alchemy.run/guides/cloudflare-state-store/).
   - In CI, apps use **`alchemyCiCloudStateStoreOptions(stage)`** on a state worker named from **`PRODUCT_PREFIX`** + **`STAGE`**. Every deploy package lists **`state-hub`** as a **`devDependency`** so Turbo **`^deploy:*`** runs the hub **before** other deploys (single creator → avoids **[10065 … already in use](https://developers.cloudflare.com/workers/configuration/durable-objects/)** on the state DO).
   - **`bun run setup`** / **`setup:staging`** / **`setup:prod`** walks both keys in the browser. **`github:sync`** / **`github:sync:*`** pushes them to the GitHub Environment with the other deploy secrets (defaults: `gh auth token` / `gh repo view`).
   - **`github:env:*`** updates **only** **`RepositoryEnvironment`** **deployment protection** from **`config/github.policy.ts`** (see [`stacks/github-repository-environment-from-env.ts`](../../../stacks/github-repository-environment-from-env.ts)); it does **not** upload secrets or Environment variables. Stage dotfile may still be merged for local process env.

4. **Infra source of truth** — Package-local **`alchemy.run.ts`** files. Changing bindings means updating the relevant package app. `env.d.ts` files use the exported package worker resource's `Env`.

5. **Turbo + stage files**
   - **`bun run dev`** — filtered Turbo **`dev`**: web + worker packages run **`alchemy-cli.ts dev …`** ([Alchemy Turborepo](https://alchemy.run/guides/turborepo/)).
   - **`deploy:*`** / **`destroy:*`** — stage-specific graphs; **`--app`** comes from **`alchemy-cli.ts`** + **`ALCHEMY_APP_IDS`**.
   - **`dotenv-cli`** — `bunx dotenv-cli -v STAGE=… -e .env.staging|.env.production -- …`. Locally, the stage file loads when present; in CI, missing repo dotfiles → values from **GitHub Environment** via **`process.env`**.
   - Infra that belongs in git: **`alchemy.run.ts`**, not env files.

6. **Per-package `.env.local`** — Optional; include in Turbo **`inputs`** where a package’s tasks need it (e.g. chatroom-do). Never substitute **`.env.example`** for real values.

## Cloudflare API token + account ID

**Same account for both values**

- **`CLOUDFLARE_API_TOKEN`** and **`CLOUDFLARE_ACCOUNT_ID`** must point at the **same** Cloudflare account.
- Workers API calls are scoped by **`CLOUDFLARE_ACCOUNT_ID`**. The [Cloudflare state store](https://alchemy.run/guides/cloudflare-state-store/) uses that account’s **`workers.dev`** subdomain.
- **Common failure mode:** token for account A + ID for account B, or swapping the two keys → vague errors, e.g. **`[CloudflareStateStore]`** RPC **404** with **`text/html`**, wrong-account deploys, subdomain mismatch.

**How to stay sane**

- When creating the token, match **Account ID** from the dashboard (**Workers & Pages** / account context) and restrict **Account Resources** to **that** account.
- Keep **`.env.staging`** / **`.env.production`**, **GitHub Environment** fields, and local dotfiles **consistent per stage**.

**GitHub Actions**

- **`CLOUDFLARE_ACCOUNT_ID`** → Environment **variable** (plaintext), not a Secret.
- **`CLOUDFLARE_API_TOKEN`** → Secret.
- **`github:sync`** / **`github:sync:*`** upserts the account id as a variable.

**PR previews**

- Same-repo PRs → Environment **`staging`**.
- Fork PRs run Quality only in the stock workflows and do not receive deploy secrets. **`staging-fork`** remains in policy/sync for legacy or future use.

## Typical layout

```
.env.example              # documentation only
.env.local                # gitignored dev — loaded by root `bun run dev` / package dev scripts
.env.staging              # gitignored — staging + PR preview deploy inputs (`STAGE=staging` or `pr-<n>`)
.env.production           # gitignored prod / CI secrets as needed (`STAGE=prod`)
stacks/admin.ts           # local-only admin stack — GitHub Environment secrets + deploy enablement var
packages/alchemy-utils/   # `PRODUCT_PREFIX`, `ALCHEMY_APP_IDS`, `src/alchemy-cli.ts`, `requireAlchemyPassword`, deployment-stage
packages/state-hub/       # `alchemy.run.ts` — provisions shared CI CloudflareStateStore (`ALCHEMY_APP_IDS.stateHub`)
apps/web/
  alchemy.run.ts          # web Alchemy app
  env.d.ts                # Alchemy-derived Env (see multiworker-workflow / cf-web-alchemy-bindings)
```

## Checklist after changing env or bindings

- Update **repo-root `.env.example`** so contributors know which keys exist.
- Update the relevant package **`alchemy.run.ts`**.
- Run **`bun run typegen`** from the **repo root**.
- For production parity: **`turbo run typegen:prod`** then **`turbo run typecheck:prod`** if prod env differs.

## Related docs

- [`multiworker-workflow`](../multiworker-workflow/SKILL.md) — typegen cadence, deploy, checklist.
- [`multiworker-gotchas`](../multiworker-gotchas/SKILL.md) — stack-specific gotchas.
- [`project-init`](../project-init/SKILL.md) — renaming resources after forking the template.
- [Alchemy Getting Started](https://alchemy.run/getting-started/) — `alchemy dev` / `deploy`, `alchemy login`.
