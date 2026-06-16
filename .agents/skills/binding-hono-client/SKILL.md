---
name: binding-hono-client
description: Typed HTTP clients for Cloudflare service bindings — bindingHonoClient, WorkerBindingRegistry, Worker RPC with clientApp, HonoClientApp. Use when calling env.CHATROOM or any WorkerRef/BoundWorker over fetch with @firtoz/hono-fetcher, adding a worker Hono app RPC type, or fixing JsonResponse<any> / missing .delete on binding clients.
---

# Typed Hono clients for service bindings

## When to use

- Web (or any consumer) calls a peer worker over a **service binding** (`env.CHATROOM`, `WorkerRef`, etc.) and you want **typed routes + JSON bodies** from `@firtoz/hono-fetcher`.
- Adding a new worker with a Hono `app` on its entrypoint.
- Debugging `TypedHonoFetcher<Hono<ClientEnv, any, any>>`, `JsonResponse<any>`, or missing methods like `.delete` on a binding client.

**Not this skill:** Durable Object HTTP from a namespace → `honoDoFetcherWithName(env.MyDo, name)` ([durable-object-package](../durable-object-package/SKILL.md)). Auth worker multi-mount sub-apps → `createAuthWorkerHonoClient` / `honoFetcherMounted` ([auth-setup](../auth-setup/SKILL.md)).

## Consumer (web): `bindingHonoClient`

**One generic helper** — [apps/web/app/lib/bound-worker-hono-client.ts](../../../apps/web/app/lib/bound-worker-hono-client.ts):

```typescript
import { bindingHonoClient } from "~/lib/bound-worker-hono-client";

const api = bindingHonoClient(env.CHATROOM);
const res = await api.delete({
  url: "/admin/messages/:messageId",
  params: { messageId },
  query: { room: roomId },
  init: { headers },
});
const body = await res.json(); // typed from the worker route schema
```

- **Origin hostname is irrelevant** — only the path is forwarded over the binding (`http://service-binding` default).
- **Do not** add per-worker `chatroomHonoClient()` factories unless you have a special case (auth mounts).
- Import **`ChatroomWorkerBinding`** / env slices from [chatroom-worker-hono-client.ts](../../../apps/web/app/lib/chatroom-worker-hono-client.ts) when you need binding types only — not for HTTP calls.

### `WorkerBindingRegistry` (one row per binding)

TypeScript **cannot** derive hono-fetcher route/response types from `Fetcher<YourWorkerRpc>` alone (Cloudflare drops custom RPC fields; `HonoClientApp<GenericApp>` does not materialize schemas). **Bindings** still infer from Alchemy (`CloudflareEnv["CHATROOM"]`); only the **client schema** needs a registry row.

Same pattern as merging `Cloudflare.Env` in [env.d.ts](../../../apps/web/types/env.d.ts) or extending React Router `AppLoadContext` in [workers/app.ts](../../../apps/web/workers/app.ts):

**Register** in [apps/web/types/worker-binding-registry.d.ts](../../../apps/web/types/worker-binding-registry.d.ts):

```typescript
import type { ChatroomWorkerHonoClientApp } from "chatroom-do/hono-app";

declare global {
  namespace WorkerBindingRegistry {
    interface HonoClients {
      CHATROOM: ChatroomWorkerHonoClientApp;
      // YOUR_BINDING: YourWorkerHonoClientApp;
    }
  }
}
export {};
```

**Lookup** in [bound-worker-hono-client.ts](../../../apps/web/app/lib/bound-worker-hono-client.ts) — `K` is inferred from `CloudflareEnv[K]` when you pass `env.CHATROOM`:

```typescript
export function bindingHonoClient<const K extends keyof WorkerBindingRegistry.HonoClients>(
  binding: CloudflareEnv[K],
): TypedHonoFetcher<WorkerBindingRegistry.HonoClients[K]>
```

Add sibling maps under `WorkerBindingRegistry` later (e.g. `Rpc`, env slices) for other typed helpers — same augmentation site as `env.d.ts`.

## Producer (worker package): RPC + Hono types

Reference: [durable-objects/chatroom-do](../../../durable-objects/chatroom-do).

### 1. Hono app + client schema (same package)

In `src/hono-app.ts` (or equivalent):

```typescript
export const chatroomWorkerApp = new Hono<{ Bindings: ChatroomWorkerBindingEnv }>()
  .get("/service-ack", …)
  .delete("/admin/messages/:messageId", …);

export type ChatroomWorkerApp = typeof chatroomWorkerApp;
export type { HonoClientApp } from "./hono-client-app";
export type ChatroomWorkerHonoClientApp = HonoClientApp<ChatroomWorkerApp>;

export type ChatroomWorkerRpc = Rpc.WorkerEntrypointBranded & {
  readonly app: ChatroomWorkerApp;
  readonly clientApp: ChatroomWorkerHonoClientApp;
};
```

- **`clientApp` is type-only** (phantom on RPC) — documents the client schema; runtime entrypoint still exposes `readonly app`.
- Keep **Hono context bindings** in a small file **without** importing `alchemy.run` (e.g. [worker-binding-env.ts](../../../durable-objects/chatroom-do/src/worker-binding-env.ts)) to avoid type cycles with `env.d.ts`.

### 2. `HonoClientApp` shim (Hono v4)

Use [hono-client-app.ts](../../../durable-objects/chatroom-do/src/hono-client-app.ts) — **not** bare `Hono<any, infer S, infer B>` (instance types do not match in v4):

```typescript
export type HonoClientApp<T> = [T] extends [
  Hono<infer _E, infer S, infer BasePath extends string>,
]
  ? Hono<Record<string, never>, S, BasePath>
  : never;
```

Evaluate **`HonoClientApp<typeof yourApp>` once** at the worker package and export `YourWorkerHonoClientApp`. Do not rely on `HonoClientApp<GenericApp>` at the call site for response types.

Shared RPC helpers: [workers/worker-rpc-types.ts](../../../durable-objects/chatroom-do/workers/worker-rpc-types.ts) (`WorkerRpcWithHonoClient`, `AnyHonoInstance`). Re-export from [workers/rpc.ts](../../../durable-objects/chatroom-do/workers/rpc.ts).

### 3. Alchemy: `Worker<Bindings, RPC>`

```typescript
export const chatroomWorker = await Worker<
  typeof chatroomWorkerBindings,
  ChatroomWorkerRpc
>(DEFAULT_WORKER_RESOURCE_ID, {
  entrypoint: new URL("./workers/app.ts", import.meta.url).pathname,
  bindings: chatroomWorkerBindings,
});
```

Alchemy `Bound<T>` maps `_Worker<any, infer RPC>` → `BoundWorker<RPC>`, so `CloudflareEnv["CHATROOM"]` on the web worker is typed from this RPC.

### 4. Entrypoint class

```typescript
export default class ChatroomWorker extends WorkerEntrypoint<Env> {
  readonly app = chatroomWorkerApp;
  async fetch(request: Request) {
    return chatroomWorkerApp.fetch(request, this.env, this.ctx);
  }
}
```

### 5. Web wiring

[web-alchemy-bindings](../web-alchemy-bindings/SKILL.md): `CHATROOM: chatroomWorker` in `ReactRouter` bindings → `bun run typegen`.

## Checklist — new bound worker with Hono HTTP

| Step | Where |
| --- | --- |
| Hono app + `YourWorkerApp` / `YourWorkerHonoClientApp` | worker `src/hono-app.ts` |
| `YourWorkerRpc` with `app` + `clientApp` | same file or `workers/rpc.ts` |
| `Worker<typeof bindings, YourWorkerRpc>` | worker `alchemy.run.ts` |
| Export `./hono-app` + `./workers/rpc` | worker `package.json` |
| `YOUR_BINDING: yourWorker` binding | `apps/web/alchemy.run.ts` |
| Registry row `YOUR_BINDING: YourWorkerHonoClientApp` | `apps/web/types/worker-binding-registry.d.ts` |
| `bun run typegen` + `bun run typecheck` | repo root |

## Common mistakes

| Mistake | Why it breaks | Do instead |
| --- | --- | --- |
| Per-worker `fooHonoClient(binding)` factory | Duplication; same as generic helper | `bindingHonoClient(env.FOO)` + registry row |
| `WorkerRpcWithHonoApp` only (`app: Hono<any,any,any>`) | Inferred client is `any` routes / `JsonResponse<any>` | Pre-resolved `YourWorkerHonoClientApp` + registry row |
| Infer client from `Fetcher<infer RPC>` | `clientApp` not preserved on inferred RPC | `WorkerBindingRegistry.HonoClients` keyed by binding name |
| `HonoClientApp<App>` with generic `App` at call site | TS does not materialize route outputs | Export alias at worker package; registry on web |
| `Pick<EntrypointClass, "app">` for worker RPC | Cycles with `env.d.ts` / Alchemy `Env` | `typeof yourWorkerApp` + standalone binding env type |
| Raw `binding.fetch` + JSON cast | Loses hono-fetcher typing | `bindingHonoClient` + `.get` / `.delete` / `.json()` |

## See also

- [web-alchemy-bindings](../web-alchemy-bindings/SKILL.md) — wire bindings in `apps/web/alchemy.run.ts`.
- [worker-rpc-turbo](../worker-rpc-turbo/SKILL.md) — `workers/rpc.ts`, `WorkerRef`, env-free RPC files.
- [durable-object-package](../durable-object-package/SKILL.md) — DO Hono + `honoDoFetcherWithName`.
- [typescript-imports.mdc](../../rules/typescript-imports.mdc) — import `ChatroomWorkerHonoClientApp` from `chatroom-do/hono-app`, not re-exported from web helpers.
