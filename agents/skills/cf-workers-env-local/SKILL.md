---
name: cf-workers-env-local
description: Alchemy + env files — repo-root `.env.local` (dev), `.env.staging` (staging / PR preview deploys), `.env.production` (prod / CI), optional per-package `.env.local`, and package-local Alchemy apps. Use when adding secrets or non-secret vars, debugging missing env in local dev, or local vs prod typegen. Never use a plain `.env` file. `.env.example` is human documentation only — no script reads it for all keys.
---

# Alchemy — env files and package apps

## When to use this skill

- Adding, renaming, or documenting environment variables for the web worker, chatroom worker, or D1.
- Local dev shows missing vars for Alchemy (each app uses **`alchemy dev --app <id>`**; see [Alchemy Turborepo](https://alchemy.run/guides/turborepo/)).
- Choosing **local** (`typegen:local` / `typecheck:local`) vs **prod** (`typegen:prod` / `typecheck:prod`) for CI.
- Explaining **repo-root** `.env.local` + `.env.staging` + `.env.production` vs optional per-package `.env.local`.

## Ground rules

1. **`.env.example` (repo root, optional `apps/web/.env.example`)** — **Human documentation only** for most keys. Root **`bun run dev`** and package dev scripts read the real **`.env.local`**; Alchemy docs cover [Secrets](https://alchemy.run/providers/cloudflare/secret/) and [State](https://alchemy.run/concepts/state/).

2. **Real env** — Put dev values in **`.env.local`** (gitignored). Use **`.env.staging`** for staging + PR preview deploys (`STAGE=staging` or `STAGE=pr-<n>`) and **`.env.production`** for production (`STAGE=prod`). **Do not use a plain `.env` file.**

3. **`ALCHEMY_PASSWORD`** + **`ALCHEMY_STATE_TOKEN` and CI deploy** — The password must match for every **`alchemy deploy`** touch that stage ([encryption password](https://alchemy.run/concepts/secret/#encryption-password)). **`ALCHEMY_STATE_TOKEN`** is one stable bearer token per Cloudflare account for the [Cloudflare-backed Alchemy state store](https://alchemy.run/guides/cloudflare-state-store/); **`CI=true`** deploys spread `alchemyCiCloudStateStoreOptions` into each app so infra state survives ephemeral runners. **`bun run setup`** / **`setup:staging`** / **`setup:prod`** covers both keys in the browser; **`github:sync:*`** pushes **`ALCHEMY_STATE_TOKEN`** to the GitHub Environment with the other deploy secrets (`gh auth token` / `gh repo view` unless overridden).

4. **Infra source of truth** — Package-local **`alchemy.run.ts`** files. Changing bindings means updating the relevant package app. `env.d.ts` files use the exported package worker resource's `Env`.

5. **Turbo graph** — Root **`bun run dev`** runs a **filtered** Turbo **`dev`** so only web + worker packages run **`alchemy dev --app …`** (see [Alchemy Turborepo](https://alchemy.run/guides/turborepo/)). **`bun run deploy:prod`** / **`deploy:staging`** / **`deploy:preview`** and matching **`destroy:*`** use stage-specific Turbo graphs; package scripts use Alchemy CLI with **`--app`**. Deploy/destroy scripts use **`dotenv-cli`** (`bunx dotenv-cli -v STAGE=… -e .env.staging|.env.production -- …`): local runs load the stage file when present, and CI falls through to GitHub Environment values from **`process.env`** when repo dotenv files are absent. Checked-in package config belongs in **`alchemy.run.ts`**.

6. **Per-package `.env.local`** — Optional; include in Turbo **`inputs`** where a package’s tasks need it (e.g. chatroom-do). Never substitute **`.env.example`** for real values.

## Typical layout

```
.env.example              # documentation only
.env.local                # gitignored dev — loaded by root `bun run dev` / package dev scripts
.env.staging              # gitignored — staging + PR preview deploy inputs (`STAGE=staging` or `pr-<n>`)
.env.production           # gitignored prod / CI secrets as needed (`STAGE=prod`)
stacks/admin.ts           # local-only admin stack — GitHub Environment secrets + deploy enablement var
packages/cf-starter-alchemy/
  password.ts             # `requireAlchemyPassword(app)` after `await alchemy(...)`
apps/web/
  alchemy.run.ts          # web Alchemy app
  env.d.ts                # Alchemy-derived Env (see cf-starter-workflow / cf-web-alchemy-bindings)
```

## Checklist after changing env or bindings

- Update **repo-root `.env.example`** so contributors know which keys exist.
- Update the relevant package **`alchemy.run.ts`**.
- Run **`bun run typegen`** from the **repo root**.
- For production parity: **`turbo run typegen:prod`** then **`turbo run typecheck:prod`** if prod env differs.

## Related docs

- [`cf-starter-workflow`](../cf-starter-workflow/SKILL.md) — typegen cadence, deploy, checklist.
- [`cf-starter-gotchas`](../cf-starter-gotchas/SKILL.md) — stack-specific gotchas.
- [`project-init`](../project-init/SKILL.md) — renaming resources after forking the template.
- [Alchemy Getting Started](https://alchemy.run/getting-started/) — `alchemy dev` / `deploy`, `alchemy login`.
