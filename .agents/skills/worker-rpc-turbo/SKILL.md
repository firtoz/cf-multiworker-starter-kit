---
name: worker-rpc-turbo
description: workers/rpc.ts for WorkerRef or DO RPC types, package exports, cross-worker type imports without Turbo cycles, and root dev/destroy wiring. Use when adding WorkerRef, WorkerStub, workers/rpc.ts, turbo circular dependency warnings, or a new app missing from root bun run dev.
---

# Cross-worker RPC and Turbo monorepo wiring

## When to use

- Typing `WorkerRef<Rpc>`, `WorkerStub<Rpc>`, or `DurableObjectNamespace<DoRpc>`.
- Adding [durable-objects/*/workers/rpc.ts](durable-objects/chatroom-do/workers/rpc.ts) (or equivalent).
- Turbo reports **circular package dependency** between two worker packages.
- A new `durable-objects/*` or worker package does not start with `bun run dev` from root, or `turbo run destroy:*` order is wrong.

## `workers/rpc.ts` rules

1. **Keep it env-free** — Only `export type` + `Rpc.*Branded` intersections. **No** `import` from `../env` (avoids extra `Env` when another package typechecks this file).

2. **Exports** — In that package [package.json](durable-objects/chatroom-do/package.json): `"./workers/rpc": "./workers/rpc.ts"`. Re-export from `./alchemy` with `export type { … }` when consumers only need the main entry (optional).

3. **Alchemy** — Use the exported RPC type: `DurableObjectNamespace<YourDoRpc>`, `WorkerRef<OtherWorkerRpc>`, `Worker<typeof bindings, YourWorkerRpc>`, etc.

4. **Worker HTTP + hono-fetcher (web consumer)** — For a worker entrypoint with a Hono `app`, export `YourWorkerHonoClientApp` and put `app` + `clientApp` on `YourWorkerRpc`. Web calls use `bindingHonoClient(env.YOUR_BINDING)` — full checklist in [binding-hono-client](../binding-hono-client/SKILL.md). Do **not** expect `Fetcher<infer RPC>` to preserve `clientApp` for inference.

## Peer stubs / refs (`chatroom-do` → `auth-worker`)

When a worker package **`WorkerRef`** / **`WorkerStub`** a peer to avoid `./alchemy` value-import cycles, paste **no drift** **`service`** / **`name`** strings derived from **`omitDefaultPhysicalWorkerScriptName(peerAlchemyAppId, app.stage)`** with **`DEFAULT_WORKER_RESOURCE_ID`/`ALCHEMY_APP_IDS`** from **`alchemy-utils/worker-peer-scripts`**.

## Cross-package imports (avoid Turbo / npm cycles)

- Prefer **one** `workspace:*` direction between two siblings (e.g. `chatroom-do` → `auth-worker` for `import type { AuthWorkerRpc } from "auth-worker/alchemy"`).
- The other package: **relative** `import type` from `../<sibling>/workers/rpc` (not `from "<sibling>/alchemy"`) so both sides are not `workspace` deps of each other for types.
- If both must depend on each other, Turbo’s package graph can cycle—restructure to one-way + relative, or duplicate a minimal type (last resort).

## Root `bun run dev` — explicit filters

- [package.json](package.json) `dev` uses `turbo run dev --filter=@internal/web --filter=...`. **Add** `--filter=<new-package-name>` for each new top-level Alchemy app or it will not run in the root dev TUI.

## Destroy order

- In [turbo.json](turbo.json), new worker apps that depend on the web should have `<pkg>#destroy:prod`, `#destroy:staging`, and `#destroy:preview` each with `dependsOn` on the matching **`@internal/web#destroy:*`** so the web is destroyed first (match existing **`chatroom-do#destroy:*`**, etc.).

## See also

- [durable-object-package](../durable-object-package/SKILL.md) — alchemy + env inside one package.
- [web-alchemy-bindings](../web-alchemy-bindings/SKILL.md) — web `ReactRouter` bindings and `apps/web/alchemy.run.ts`.
- [binding-hono-client](../binding-hono-client/SKILL.md) — typed HTTP clients for bound workers.
