---
name: auth-setup
description: Auth worker setup for Better Auth, OAuth, admin bootstrap, and env/secrets. Use when configuring auth for a fork, setting redirect URIs, or debugging auth env.
---

# Auth worker setup (Better Auth + D1)

Use when configuring authentication for a fork of this starter kit: env secrets, OAuth redirect URIs, admin bootstrap, and smoke tests.

## Packages

| Package | Role |
|---------|------|
| `packages/auth-db` | D1 schema, migrations, **`api-schemas`**, **`constants`** |
| `workers/auth-worker` | Better Auth HTTP API, KV trusted origins, admin API |
| `packages/auth-client` | Binding/session client (`createAuthClient`, `getSession`) — not a barrel for auth-db |
| `apps/web` | Login UI, account, admin UI, session in root loader |

## Fork checklist

1. Set **`PRODUCT_PREFIX`** in [`packages/alchemy-utils/src/worker-peer-scripts.ts`](../../packages/alchemy-utils/src/worker-peer-scripts.ts) (Alchemy app ids follow automatically).
2. Configure repo-root **`.env.local`** (and staging/production dotfiles):
   - `BETTER_AUTH_SECRET` — `openssl rand -base64 32`
   - `AUTH_ADMIN_SECRET` — machine admin API (origins automation)
   - `AUTH_BOOTSTRAP_ADMIN_EMAILS` — optional operator email(s); auto-promote on sign-up; existing users via **`bun run auth:sync-bootstrap-admins`** after deploy (CI step); sync with `github:sync:*` when set (Environment **variable**, not secret)
   - **`WEB_DOMAINS`** (optional) — custom hostname(s) for the web app; also the Better Auth public URL (`/api/auth/*` on the web worker)
   - **Local dev** defaults to the web Portless URL (`https://<PRODUCT_PREFIX>-web.localhost`)
   - **workers.dev-only** staging/prod — Alchemy infers the web worker URL from Cloudflare API (no extra env)
   - **`AUTH_DOMAINS`** — **ignored** (auth worker is service-binding only; do not set)
   - Optional: `GOOGLE_*`, `GH_*` — [`docs/oauth-setup.md`](../../docs/oauth-setup.md). **Local Portless + Google:** register `http://127.0.0.1:5173/api/auth/callback/google`; Better Auth `oAuthProxy` keeps browsing on `https://<prefix>-web.localhost`. **GitHub:** one **OAuth App** per stage (single callback URL each). **PR previews:** OAuth (GitHub + Google) proxies through the **staging** callback — staging stack must stay deployed; see [`docs/oauth-setup.md` § PR previews](../../docs/oauth-setup.md#pr-previews). **Staging/production:** [`§ Multi-environment`](../../docs/oauth-setup.md#multi-environment-setup-local-staging-production) (`github:sync:*`).
3. Run **`bun run setup:local`** (or staging/prod) so secrets flow into dotfiles and GitHub sync.
4. **OAuth consoles** — register callback URLs (see [`docs/oauth-setup.md`](../../docs/oauth-setup.md)):
   - `https://<web-origin>/api/auth/callback/google`
   - `https://<web-origin>/api/auth/callback/github`
   - Must match the resolved **web** auth base URL exactly (Portless hostname, `WEB_DOMAINS`, or workers.dev)
5. **`bun run dev`** — includes `@internal/auth-db`, `auth-worker`, web, chatroom-do.
6. **First deploy** — auth-db migrations apply via Alchemy; trusted origins seed from the web auth URL and `WEB_DOMAINS` on first auth-worker request.
7. **Smoke test** — sign in → `/account` → `/admin` (admin only) → `/chat` (authenticated WebSocket).
8. After adding **`isAnonymous`** (Better Auth anonymous plugin), run **`bun run db:generate:auth`** and restart dev so D1 migrations apply.

## Public auth URL (no dotfile key)

Alchemy computes the public auth URL via **`resolveAuthBaseUrl`** in [`packages/alchemy-utils/src/auth-deploy-hostnames.ts`](../../packages/alchemy-utils/src/auth-deploy-hostnames.ts) and wires it to the auth worker **`AUTH_BASE_URL`** binding. Browsers always call same-origin **`/api/auth/*`** on the web worker (email, OAuth, anonymous chat) — no client env var for the auth host.

**Ladder** (first match wins):

1. **Local** — `https://<PRODUCT_PREFIX>-web.localhost` (Portless web origin; auth proxied at `/api/auth/*`)
2. **`WEB_DOMAINS`** — first hostname → `https://<host>`
3. **workers.dev** — inferred web worker URL when domain env is unset (requires Cloudflare API creds at deploy)

The auth worker has **no public HTTPS** — Alchemy deploys with **`url: false`** (no `workers.dev`), **`domains: []`**. Sibling workers reach it via **`env.AUTH`** only.

OAuth redirect URIs must match the resolved URL: `https://<host>/api/auth/callback/google` (and GitHub).

**Local dev:** Alchemy may listen on auth worker `:8784` for the binding; do not browse or register OAuth there. Use the **web** origin.

## Anonymous chat guests

- Better Auth **`anonymous()`** plugin on `auth-worker` (`user.isAnonymous`, synthetic email `*@<PRODUCT_PREFIX>.guest`).
- Display names: **`unique-names-generator`** (adjective + animal, e.g. `Coastal-Falcon`) via `workers/auth-worker/src/guest-display-name.ts` — not a shared `"Guest"` label.
- **`/chat` loader** calls `ensureChatSession` from **`apps/web/app/lib/ensure-chat-session.ts`** → `POST /api/auth/sign-in/anonymous` when logged out; sets session cookie on the document response.
- **Guest** sessions: capped at **7 days** (`GUEST_SESSION_SECONDS`, enforced in `databaseHooks.session`) with **`updateAge` 1 day** — each visit extends expiry; no visit for a week and the guest identity is gone.
- **Signed-in** accounts: default **30 days** (`SIGNED_IN_SESSION_SECONDS` in `createAuth()`); guest upgrade / OAuth graduation extends active sessions to this duration.
- **Guest upgrade** at **`/guest/upgrade`**: email (`POST /api/guest/upgrade/email`) or OAuth **`link-social`** promotes the **same** `user.id` (`isAnonymous: false`); chat history in DO SQLite stays attached without migration.
- Nav shows **Create account** for guests; `/login` redirects anonymous sessions to `/guest/upgrade`.

## Service binding calls (`AUTH.fetch`)

**Do not** call `env.AUTH.fetch` directly from web routes for custom auth-worker APIs. Use **`@internal/auth-client`** for client/session/binding helpers only.

**Imports:** [typescript-imports.mdc](../../rules/typescript-imports.mdc) — do not pull `AccountSummary`, `AdminUserRow`, etc. from `@internal/auth-client`. Use **`@internal/auth-db/api-schemas`** (and **`@internal/auth-db/constants`** for TTL/copy constants).

- **`createAuthClient(env.AUTH, request)`** — browser-backed session + custom API. Returns `{ session, admin, profile, fetch }` with **`MaybeError`** on mutations.
- **`createServiceAuthClient(env.AUTH, secret)`** — machine admin (`AUTH_ADMIN_SECRET`) for cron/automation without a browser session.
- **`getSession` / `requireAdmin`** on `auth.session.*` (Better Auth `/api/auth/*`). Chat guest bootstrap: **`ensureChatSession`** in the web app (`~/lib/ensure-chat-session`), not on `@internal/auth-client`.

Example:

```ts
import { createAuthClient } from "@internal/auth-client";
import type { AdminUserRow } from "@internal/auth-db/api-schemas";

const auth = createAuthClient(env.AUTH, request);
const session = await auth.session.get();
await auth.profile.update({ name: displayName });
const users = await auth.admin.listUsers(); // AdminUserRow[] in result
```

### Drizzle-derived API schemas

Wire types for profile PATCH and admin list rows are **inferred from the Drizzle `user` table** in [`packages/auth-db/src/api-schemas/`](../../packages/auth-db/src/api-schemas/) via **`drizzle-zod`** (`createUpdateSchema` / `createSelectSchema` + `.pick()` allowlist).

Fork checklist for a new self-service profile field:

1. Column on `user` in [`packages/auth-db/src/schema.ts`](../../packages/auth-db/src/schema.ts) (if new).
2. Add key to **`profilePatchableColumns`** in `api-schemas/profile.ts` — `ProfileUpdate` type updates automatically.
3. Optional refinements in `createUpdateSchema(user, { field: (s) => s... })`.

Admin-only fields (e.g. `role`) stay on admin routes with small standalone Zod objects, not `profile.update`.

Session clients use **`buildAuthBindingHeaders`** (`packages/auth-client/src/binding-headers.ts`):

1. **`Origin`** from `Host` / `X-Forwarded-Host` (Portless serves `https://<prefix>-web.localhost` while `request.url` may still be `http://127.0.0.1:5173`). Better Auth rejects POSTs with a cookie but a non-trusted `Origin`.
2. **Cookie** header filtered to Better Auth cookies only — third-party cookies (e.g. PostHog) must not be forwarded or anonymous sign-in can return **403**.

Trusted origins seed from the resolved auth URL, `WEB_DOMAINS`, `AUTH_SEED_ORIGINS`, and local `http://127.0.0.1:<port>` (see `auth-worker/alchemy.run.ts`). Add production origins in **`/admin/origins`** or env seeds.

## Architecture notes

- Web reaches auth via **`env.AUTH`** (auth worker binding), not `context.cloudflare.env`.
- **`createAuthWorkerHonoClient`** ([`packages/auth-client/src/binding/auth-worker-hono-client.ts`](../../packages/auth-client/src/binding/auth-worker-hono-client.ts)) mounts typed sub-app clients with **`honoFetcherMounted`** from `@firtoz/hono-fetcher` (requires **2.8.2+** for correct root-route query join, e.g. `GET /api/account?includeSessions=1`).
- Chat WebSocket: **web → chatroom worker → Chatroom DO**. The **chatroom worker** resolves identity via **`env.AUTH`** (`getSession` + profile display name); the web worker only forwards cookies and the internal secret.
- **Human admin** = `user.role === "admin"` (browser `/admin/*`: trusted origins, user list with editable display names). **Machine admin** = `AUTH_ADMIN_SECRET` header on **`POST /api/internal/admin/bootstrap-sync`** (web worker) or auth-worker `/admin/*` over service binding only — never exposed without the secret (404 when missing/wrong).

## Commands

```bash
bun run db:generate:auth   # after editing packages/auth-db/src/schema.ts
bun run auth:sync-bootstrap-admins   # after deploy (POST web /api/internal/admin/bootstrap-sync + AUTH_ADMIN_SECRET)
bun run typegen            # after routes or alchemy binding changes
bun run typecheck
```
