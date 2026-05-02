---
name: cf-workers-env-local
description: Alchemy + env files — repo-root `.env.local` (dev), `.env.staging` (staging / PR preview deploys), `.env.production` (prod / CI), optional per-package `.env.local`, and package-local Alchemy apps. Use when adding secrets or non-secret vars, debugging missing env in local dev, or local vs prod typegen. Never use a plain `.env` file. `.env.example` is human documentation only — no script reads it for all keys.
---

# Alchemy — env files and package apps

## When to use this skill

- Adding, renaming, or documenting environment variables for the web worker, chatroom worker, or D1.
- Local dev shows missing vars for Alchemy (each app uses **`alchemy-cli.ts dev <CF_STARTER_APPS key>`** → **`alchemy dev --app <id>`**; see [Alchemy Turborepo](https://alchemy.run/guides/turborepo/)).
- Choosing **local** (`typegen:local` / `typecheck:local`) vs **prod** (`typegen:prod` / `typecheck:prod`) for CI.
- Explaining **repo-root** `.env.local` + `.env.staging` + `.env.production` vs optional per-package `.env.local`.

## Ground rules

1. **`.env.example` (repo root, optional `apps/web/.env.example`)** — **Human documentation only** for most keys. Root **`bun run dev`** and package dev scripts read the real **`.env.local`**; Alchemy docs cover [Secrets](https://alchemy.run/providers/cloudflare/secret/) and [State](https://alchemy.run/concepts/state/).

2. **Real env** — Put dev values in **`.env.local`** (gitignored). Use **`.env.staging`** for staging + PR preview deploys (`STAGE=staging` or `STAGE=pr-<n>`) and **`.env.production`** for production (`STAGE=prod`). **Do not use a plain `.env` file.**

3. **`ALCHEMY_PASSWORD`** + **`ALCHEMY_STATE_TOKEN` and CI deploy** — The password must match for every **`alchemy deploy`** touch that stage ([encryption password](https://alchemy.run/concepts/secret/#encryption-password)). **`ALCHEMY_STATE_TOKEN`** is one stable bearer token per Cloudflare account for the [Cloudflare-backed Alchemy state store](https://alchemy.run/guides/cloudflare-state-store/). In CI, every app spreads **`alchemyCiCloudStateStoreOptions(stage)`** onto the same Cloudflare state worker name derived from **`PRODUCT_PREFIX`** + **`STAGE`**, and every deploy package lists **`state-hub`** as a **`devDependency`** so Turbo **`dependsOn`** **`^deploy:*`** runs the hub before sibling **`deploy:*`** tasks (only the hub creates that worker once; parallel deploys therefore avoid **[10065 … already in use](https://developers.cloudflare.com/workers/configuration/durable-objects/)** on the state DO). **`bun run setup`** / **`setup:staging`** / **`setup:prod`** covers both keys in the browser; **`github:sync`** / **`github:sync:*`** pushes **`ALCHEMY_STATE_TOKEN`** to the GitHub Environment with the other deploy secrets (`gh auth token` / `gh repo view` unless overridden).

4. **Infra source of truth** — Package-local **`alchemy.run.ts`** files. Changing bindings means updating the relevant package app. `env.d.ts` files use the exported package worker resource's `Env`.

5. **Turbo graph** — Root **`bun run dev`** runs a **filtered** Turbo **`dev`** so only web + worker packages run **`alchemy-cli.ts dev …`** (see [Alchemy Turborepo](https://alchemy.run/guides/turborepo/)). **`bun run deploy:prod`** / **`deploy:staging`** / **`deploy:preview`** and matching **`destroy:*`** use stage-specific Turbo graphs; package scripts resolve **`--app`** via **`alchemy-cli.ts`** + **`CF_STARTER_APPS`**. Deploy/destroy scripts use **`dotenv-cli`** (`bunx dotenv-cli -v STAGE=… -e .env.staging|.env.production -- …`): local runs load the stage file when present, and CI falls through to GitHub Environment values from **`process.env`** when repo dotenv files are absent. Checked-in package config belongs in **`alchemy.run.ts`**.

6. **Per-package `.env.local`** — Optional; include in Turbo **`inputs`** where a package’s tasks need it (e.g. chatroom-do). Never substitute **`.env.example`** for real values.

## Cloudflare API token + account ID

**`CLOUDFLARE_API_TOKEN`** and **`CLOUDFLARE_ACCOUNT_ID`** must refer to the **same** Cloudflare account. The Workers API resolves scripts and settings under **`CLOUDFLARE_ACCOUNT_ID`**; Alchemy’s [Cloudflare state store](https://alchemy.run/guides/cloudflare-state-store/) builds **`workers.dev`** URLs using that account’s subdomain. Values from **different accounts**, or swapping token and ID fields by mistake, often surface as vague failures—for example **`[CloudflareStateStore]`** RPCs returning **404** with **`text/html`** (edge “not found” page), deployments touching the wrong account, or subdomain mismatch after partial success.

Verify **Account ID** against **Workers & Pages** in the dashboard (account-level details / URL context) when creating the token, and restrict the token to **that** account under **Account Resources**. Keep **`.env.staging`** / **`.env.production`**, **GitHub Environment** values, and **local** dotfiles **pair-wise** consistent for each stage.

**GitHub Actions:** store **`CLOUDFLARE_ACCOUNT_ID`** as an Environment **variable** (plaintext), not a Secret — it is account metadata, not an auth credential. **`CLOUDFLARE_API_TOKEN`** stays a Secret. **`github:sync`** / **`github:sync:*`** already upserts the account id as a variable.

## Typical layout

```
.env.example              # documentation only
.env.local                # gitignored dev — loaded by root `bun run dev` / package dev scripts
.env.staging              # gitignored — staging + PR preview deploy inputs (`STAGE=staging` or `pr-<n>`)
.env.production           # gitignored prod / CI secrets as needed (`STAGE=prod`)
stacks/admin.ts           # local-only admin stack — GitHub Environment secrets + deploy enablement var
packages/alchemy-utils/   # `PRODUCT_PREFIX`, `CF_STARTER_APPS`, `alchemy-cli.ts`, `requireAlchemyPassword`, deployment-stage
packages/state-hub/       # `alchemy.run.ts` — provisions shared CI CloudflareStateStore (`CF_STARTER_APPS.stateHub`)
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
