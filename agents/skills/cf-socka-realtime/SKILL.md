---
name: cf-socka-realtime
description: Socka + Durable Object WebSockets—defineSocka, SockaWebSocketDO, useSockaSession, SSR-safe ws URLs, web worker forwarding, live-draft vs commit, canvas/whiteboard acceptance, and pre-merge checks. Use for realtime features, /api/ws, or @firtoz/socka.
---

# Socka realtime (Durable Objects + web)

## When to use

- Adding or changing WebSocket RPC, server push, or per-room Durable Object state in this monorepo.
- Canvas / whiteboard / collaborative tools (patterns below are documentation; implement to product needs).

**Rule of thumb:** Prefer **`@firtoz/socka`** and a **shared contract package**; do not hand-roll `{ t: "…" }` JSON protocols unless the user explicitly wants raw WebSockets. See [cf-realtime-websockets.mdc](../../rules/cf-realtime-websockets.mdc).

## Canonical reference in this repo

| Piece | Where |
| ----- | ----- |
| `defineSocka` contract (calls + pushes) | [packages/chat-contract/src/contract.ts](../../../packages/chat-contract/src/contract.ts) |
| DO extending `SockaWebSocketDO` | [durable-objects/chatroom-do/workers/chatroom-do.ts](../../../durable-objects/chatroom-do/workers/chatroom-do.ts) |
| Web worker: upgrade → DO `/websocket` | [apps/web/workers/app.ts](../../../apps/web/workers/app.ts) |
| Client `useSockaSession` + URL from current host | [apps/web/app/components/chat/ChatClient.tsx](../../../apps/web/app/components/chat/ChatClient.tsx) |
| Route-safe `wss://` / `ws://` builder | [apps/web/app/lib/chat-ws-url.ts](../../../apps/web/app/lib/chat-ws-url.ts) |

**After `bunx turbo gen durable-object`:** the default template is Hono + optional WebSocket *forwarding*; for **Socka + DO SQLite**, copy the **chatroom** pattern (`chatroom-do` + `@internal/chat-contract`) and renames described in [project-init/SKILL.md](../project-init/SKILL.md) for forks. A dedicated Socka codegen path may be added later.

## SSR-safe WebSocket URL

- **Never** call `window`, `window.location`, or build `wss://` in loaders, actions, or component **render** on paths that run under SSR.
- On the client, prefer deriving the WebSocket origin from the **current page**:

```ts
const url = new URL(window.location.href);
url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
url.pathname = "/api/your/prefix/room-id";
// …search params as needed
```

- **Do not** use fake fallbacks like `ws://127.0.0.1/...` to satisfy a hook. If a hook needs a URL immediately, mount a **child component** only after the client has a real URL, or show a **loading shell** until then.

- Match **exactly** the path prefix handled in [apps/web/workers/app.ts](../../../apps/web/workers/app.ts) before React Router (and do not break Vite HMR upgrades).

## Live draft vs committed state (e.g. whiteboards)

For drawing apps, separate:

- **Transient in-progress updates** — e.g. `sendDraft` / push `draftUpdated` (in-progress stroke, uncommitted).
- **Durable or canonical ops** — e.g. `applyOp` / push `opApplied` after commit (persisted, undo stack, etc.).

Optionally **batch or throttle** cursor/presence on its own channel so it does not fight stroke traffic. This avoids “nothing appears until `mouseup`” for remote users.

## Canvas / whiteboard acceptance (product demos)

For interactive canvas features, expect (unless scoped otherwise):

- Drawing appears **during** pointer drag (not only on release).
- Remote **draft** state appears before **commit** where applicable.
- **Hit testing** for select tool; selected shape can **move**; selection affordances are clear.
- **Local vs remote cursors** share a coherent visual language; “trails” behave as trails/glows, not one-off static stamps.

**Testing:** `fetch` and unit tests do not catch pointer bugs. Prefer browser automation (e.g. Cursor **cursor-ide-browser** MCP or Playwright): pointer down / move / up on the canvas, then assert visual or DOM/canvas state. See [multiworker-workflow/SKILL.md](../multiworker-workflow/SKILL.md) for when typecheck is not enough.

## Fire-and-forget Socka calls

Socka `send.*` returns promises. In hot paths (pointer move, `requestAnimationFrame`, intervals), **handle rejections** so browser tests and users do not see uncaught promise errors:

```ts
void send.sendCursor(...).catch(() => undefined);
```

## Pre-merge checklist (realtime features)

- [ ] Shared **contract** exists (`defineSocka`); no ad-hoc JSON wire protocol unless justified.
- [ ] **No** `window` / `document` in SSR render paths for WebSocket URLs.
- [ ] **No** fake `localhost` / `127.0.0.1` / placeholder WebSocket URLs as runtime fallbacks.
- [ ] If applicable: **live draft** path and **committed** op path are both defined; presence/cursor path if required.
- [ ] **Browser** interaction or automation exercised for the flow; no unexplained **console** errors.
- [ ] `bun run typegen` (if routes/bindings changed), `bun run typecheck`, `bun run lint` from repo root per [multiworker-workflow/SKILL.md](../multiworker-workflow/SKILL.md).

## Related

- Durable Object package layout: [cf-durable-object-package/SKILL.md](../cf-durable-object-package/SKILL.md)
- Web bindings and worker forwarding: [cf-web-alchemy-bindings/SKILL.md](../cf-web-alchemy-bindings/SKILL.md)
- Generated / AI image assets in UI: [component-organization/SKILL.md](../component-organization/SKILL.md) (mockups and raster usage)
