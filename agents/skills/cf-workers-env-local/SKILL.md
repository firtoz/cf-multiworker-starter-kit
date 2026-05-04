---
name: cf-workers-env-local
description: Alchemy + env files — repo-root `.env.local` (dev), `.env.staging` (staging / PR preview deploys), `.env.production` (prod / CI), optional per-package `.env.local`, and package-local Alchemy apps. Use when adding secrets or non-secret vars or debugging missing env in local dev. Never use a plain `.env` file. `.env.example` is human documentation only — no script reads it for all keys.
---

# Alchemy — env files and package apps

## When to use this skill

- Adding, renaming, or documenting environment variables for the web worker, chatroom worker, or D1.
- Local dev shows missing vars for Alchemy (each app uses **`alchemy-cli.ts dev <ALCHEMY_APP_IDS key>`** → **`alchemy dev --app <id>`**; see [Alchemy Turborepo](https://alchemy.run/guides/turborepo/)).
- How **`bun run typegen`** / **`bun run typecheck`** relate to infra (`alchemy.run.ts`) vs deploy-time secrets (**`.env.*`**).
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

3. **`ALCHEMY_PASSWORD`**, **`ALCHEMY_STATE_TOKEN`**, and CI — Three different concepts; **`ALCHEMY_PASSWORD`** ≠ **`ALCHEMY_STATE_TOKEN`**.
   - **`ALCHEMY_PASSWORD`** — encrypts Alchemy-managed secrets stored in deploy state ([encryption password](https://alchemy.run/concepts/secret/#encryption-password)). Use one stable value **per logical stage** (e.g. all **`STAGE=staging`** deploys share staging’s password; prod uses prod’s password). Not required to match staging **and** prod across each other.
   - **`ALCHEMY_STATE_TOKEN`** — bearer token Alchemy sends to authenticate against the **`alchemy-state-service`** Worker (default [Cloudflare state store](https://alchemy.run/guides/cloudflare-state-store/)). Per Alchemy, **["this token must be the same for all deployments on your Cloudflare account"](https://alchemy.run/guides/cloudflare-state-store/)** — interpret that broadly for this repo:
     - **One literal value per Cloudflare account** shared by **`staging`**, **`pr-<n>`**, **`prod`**, GitHub (**`staging` / `production` / `staging-fork`** Environment **secrets**, etc.), laptops running **`deploy`/`destroy`** with non-local **`STAGE`**, and **any other repository or workload** that uses the **same account** + default **`alchemy-state-service`**. Different values → **`[CloudflareStateStore] The token is invalid`** / **401**.
     - This is **not** like **`ALCHEMY_PASSWORD`**: you do **not** get a distinct state token “per environment” or “per project.” **Same Cloudflare account and default state Worker ⇒ same secret everywhere** you pass **`ALCHEMY_STATE_TOKEN`**.
     - **`STAGE=local`** **`alchemy dev`** uses filesystem **`.alchemy/`** — no Cloudflare store, so no **`ALCHEMY_STATE_TOKEN`** for that path unless you explicitly run **`deploy`** with a non-local stage from the same machine (then match the account token).
     - After edits, **`github:sync:staging`** / **`github:sync:prod`** (trusted machine) so CI matches dotfiles — CI only reads GitHub‑supplied env.
     - **Different Cloudflare accounts** (different **`CLOUDFLARE_ACCOUNT_ID`**) ⇒ separate accounts can each have **their own** token; still **one** token **per account** covering all envs/repos that deploy to **that** account with the shared store.
   - Rare escape hatch — only if **you** choose a **`scriptName`** other than Alchemy’s default for **CloudflareStateStore**: separate Workers can theoretically use different bearer secrets; **this template ships the default** (`packages/alchemy-utils/src/alchemy-cloud-state-store.ts` → **`alchemy-state-service`**), so assume **single account token**.
   - Stack isolation is **`alchemy("…")` app id** + **`stage`**, not separate state-store Workers for each stage. For any **`STAGE` other than `local`**, apps use **`alchemyCiCloudStateStoreOptions(stage)`** with the shared Worker; stack rows are keyed inside that store ([Cloudflare state store](https://alchemy.run/guides/cloudflare-state-store/)). Every deploy package lists **`state-hub`** as a **`devDependency`** so Turbo **`^deploy:*`** runs the hub **before** other deploys (single creator → avoids **[10065 … already in use](https://developers.cloudflare.com/workers/configuration/durable-objects/)** on the state DO).
   - **`bun run setup`** / **`setup:staging`** / **`setup:prod`** walks both **`ALCHEMY_PASSWORD`** and **`ALCHEMY_STATE_TOKEN`** in the browser. **`github:sync`** / **`github:sync:*`** pushes them to GitHub Environments with the other deploy secrets (defaults: `gh auth token` / `gh repo view`).
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
packages/state-hub/       # `alchemy.run.ts` — provisions shared CloudflareStateStore for non-local stages (`ALCHEMY_APP_IDS.stateHub`)
apps/web/
  alchemy.run.ts          # web Alchemy app
  env.d.ts                # Alchemy-derived Env (see multiworker-workflow / cf-web-alchemy-bindings)
```

## Checklist after changing env or bindings

- Update **repo-root `.env.example`** so contributors know which keys exist.
- Update the relevant package **`alchemy.run.ts`**.
- Run **`bun run typegen`** from the **repo root**.
- After changing **`alchemy.run.ts`** bindings or routes, run **`bun run typegen`** and **`bun run typecheck`** from the repo root (same Turbo task names everywhere; staged dotfiles do not drive React Router typegen).

## Related docs

- [`multiworker-workflow`](../multiworker-workflow/SKILL.md) — typegen cadence, deploy, checklist.
- [`multiworker-gotchas`](../multiworker-gotchas/SKILL.md) — stack-specific gotchas.
- [`project-init`](../project-init/SKILL.md) — renaming resources after forking the template.
- [Alchemy Getting Started](https://alchemy.run/getting-started/) — `alchemy dev` / `deploy`, `alchemy login`.
