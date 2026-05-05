---
name: cf-web-alchemy-bindings
description: Wire @internal/web to durable-objects workers—workspace dep, alchemy.run.ts ReactRouter bindings, and env patterns. Use when adding `workspace:*` for a worker, editing apps/web/alchemy.run.ts, or debugging missing worker types after a new package.
---

# Web app: Alchemy bindings to workers and DOs

## When to use

- Exposing a `durable-objects/<pkg>` worker or DO to the web app’s `ReactRouter` `bindings`.
- After adding a new `workspace:*` worker dependency, fixing how `env` in [workers/app.ts](apps/web/workers/app.ts) lines up with imports in [alchemy.run.ts](apps/web/alchemy.run.ts).

## What to do

1. **Dependency** — [apps/web/package.json](apps/web/package.json): `"<package-name>": "workspace:*"`. `bun install` from repo root.

2. **Import** — [apps/web/alchemy.run.ts](apps/web/alchemy.run.ts): `import { … } from "<package-name>/alchemy"`.

3. **Bindings** — Pass each binding into `ReactRouter("…", { bindings: { …, MyDo: myWorker.bindings.MyDo, … } })` using the names your [workers/app.ts](apps/web/workers/app.ts) reads from `this.env` (e.g. `this.env.PingDo`). **D1:** import `mainDb` from `@internal/db/alchemy` and set `DB: mainDb` (D1 is defined in [packages/db/alchemy.run.ts](../../packages/db/alchemy.run.ts), not inlined in web).

4. **In route code** — Prefer `import { env } from "cloudflare:workers"` for bindings, not React Router `context` ([multiworker-gotchas](../multiworker-gotchas/SKILL.md), [cf-workers-patterns.mdc](../../rules/cf-workers-patterns.mdc)).

5. **If you are tempted to** add `include` lines in [tsconfig.cloudflare.json](apps/web/tsconfig.cloudflare.json) that point at another package’s **`workers/app.ts`**, don’t—multiple `declare global { type Env }` sources break the web `Env`. Types follow your normal imports; no need to list `durable-objects/…` in `include`.

6. **Verify** — `bun run typegen` and `bun run typecheck` from root.

## See also

- [cf-durable-object-package](../cf-durable-object-package/SKILL.md) — worker package layout.
- [cf-worker-rpc-turbo](../cf-worker-rpc-turbo/SKILL.md) — `workers/rpc.ts`, Turbo `dev` / `destroy`, cross-worker types.
