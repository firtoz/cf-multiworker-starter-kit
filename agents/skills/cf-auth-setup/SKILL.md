# Auth worker setup (Better Auth + D1)

Use when configuring authentication for a fork of this starter kit: env secrets, OAuth redirect URIs, admin bootstrap, and smoke tests.

## Packages

| Package | Role |
|---------|------|
| `packages/auth-db` | D1 schema + migrations (Better Auth tables + `role`) |
| `workers/auth-worker` | Better Auth HTTP API, KV trusted origins, admin API |
| `packages/auth-client` | `getSession`, `requireAdmin`, shared constants |
| `apps/web` | Login UI, account, admin UI, session in root loader |

## Fork checklist

1. Set **`PRODUCT_PREFIX`** in [`packages/alchemy-utils/src/worker-peer-scripts.ts`](../../packages/alchemy-utils/src/worker-peer-scripts.ts) (Alchemy app ids follow automatically).
2. Configure repo-root **`.env.local`** (and staging/production dotfiles):
   - `BETTER_AUTH_SECRET` — `openssl rand -base64 32`
   - `AUTH_ADMIN_SECRET` — machine admin API (origins automation)
   - `AUTH_BOOTSTRAP_ADMIN_EMAILS` — your operator email(s)
   - **`AUTH_DOMAINS`** (optional) — dedicated auth host, e.g. `auth.example.com`
   - **`WEB_DOMAINS`** (optional) — when auth is proxied on the web worker (`/api/auth/*`), first hostname becomes the auth public URL
   - **Local dev** defaults to the web Portless URL (`https://<PRODUCT_PREFIX>-web.localhost`)
   - **workers.dev-only** staging/prod — Alchemy infers the web worker URL from Cloudflare API (no extra env)
   - Optional: `GOOGLE_*`, `GITHUB_*` — [`docs/oauth-setup.md`](../../docs/oauth-setup.md). **Local Portless + Google:** register `http://127.0.0.1:5173/api/auth/callback/google`; Better Auth `oAuthProxy` keeps browsing on `https://<prefix>-web.localhost`. **GitHub:** one **OAuth App** per stage (single callback URL each). **Staging/production:** [`§ Multi-environment`](../../docs/oauth-setup.md#multi-environment-setup-local-staging-production) (`github:sync:*`).
3. Run **`bun run setup:local`** (or staging/prod) so secrets flow into dotfiles and GitHub sync.
4. **OAuth consoles** — register callback URLs (see [`docs/oauth-setup.md`](../../docs/oauth-setup.md)):
   - `https://<auth-host>/api/auth/callback/google`
   - `https://<auth-host>/api/auth/callback/github`
   - Must match the resolved auth base URL exactly (Portless hostname, `WEB_DOMAINS`, `AUTH_DOMAINS`, or workers.dev)
5. **`bun run dev`** — includes `@internal/auth-db`, `auth-worker`, web, chatroom-do.
6. **First deploy** — auth-db migrations apply via Alchemy; trusted origins seed from the resolved auth URL, `WEB_DOMAINS`, and `AUTH_DOMAINS` on first auth-worker request.
7. **Smoke test** — sign in → `/account` → `/admin` (admin only) → `/chat` (authenticated WebSocket).
8. After adding **`isAnonymous`** (Better Auth anonymous plugin), run **`bun run db:generate:auth`** and restart dev so D1 migrations apply.

## Public auth URL (no dotfile key)

Alchemy computes the public auth URL via **`resolveAuthBaseUrl`** in [`packages/alchemy-utils/src/auth-deploy-hostnames.ts`](../../packages/alchemy-utils/src/auth-deploy-hostnames.ts) and wires it to the auth worker **`AUTH_BASE_URL`** binding. Browsers always call same-origin **`/api/auth/*`** on the web worker (email, OAuth, anonymous chat) — no client env var for the auth host.

**Ladder** (first match wins):

1. **Local** — `https://<PRODUCT_PREFIX>-web.localhost` (Portless web origin; auth proxied at `/api/auth/*`)
2. **`AUTH_DOMAINS`** — first hostname → `https://<host>` (optional dedicated auth subdomain)
3. **`WEB_DOMAINS`** — first hostname → `https://<host>` (default **web-proxy** pattern; skip `AUTH_DOMAINS`)
4. **workers.dev** — inferred web worker URL when neither domain env is set (requires Cloudflare API creds at deploy)

**Default recommendation:** use **web proxy** only — set **`WEB_DOMAINS`** for custom hostnames, or nothing for workers.dev-only. Skip **`AUTH_DOMAINS`** unless you intentionally want split-host auth.

OAuth redirect URIs must match the resolved URL: `https://<host>/api/auth/callback/google` (and GitHub).

**Local dev listen URL vs public URL:** Alchemy may log the auth worker at `http://127.0.0.1:8784` (direct service binding port). Browsers and OAuth should use the **web** origin (`https://<PRODUCT_PREFIX>-web.localhost` by default) — auth is proxied at `/api/auth/*` on the web worker.

## Anonymous chat guests

- Better Auth **`anonymous()`** plugin on `auth-worker` (`user.isAnonymous`, synthetic email `*@<PRODUCT_PREFIX>.guest`).
- Display names: **`unique-names-generator`** (adjective + animal, e.g. `Coastal-Falcon`) via `workers/auth-worker/src/guest-display-name.ts` — not a shared `"Guest"` label.
- **`/chat` loader** calls `ensureChatSession` → `POST /api/auth/sign-in/anonymous` when logged out; sets session cookie on the document response.
- Session **`expiresIn` 7 days** with **`updateAge` 1 day** — each visit extends expiry; no visit for a week and the guest identity is gone.
- **Chatroom worker** calls `resolveChatIdentityFromAuth(env.AUTH, request)` on WebSocket connect (display name from AUTH profile, not client headers).
- Chat UI shows retention copy from `session.expiresAt`.
- Signing in with email/OAuth while anonymous runs **`onLinkAccount`** (chat history in DO SQLite is not migrated automatically).

## Service binding calls (`AUTH.fetch`)

**Do not** call `env.AUTH.fetch` directly from web routes for custom auth-worker APIs. Use **`@internal/auth-client`**:

- **`createAuthClient(env.AUTH, request)`** — browser-backed session + custom API. Returns `{ session, admin, profile, fetch }` with **`MaybeError`** on mutations.
- **`createServiceAuthClient(env.AUTH, secret)`** — machine admin (`AUTH_ADMIN_SECRET`) for cron/automation without a browser session.
- **`getSession` / `requireAdmin` / `ensureChatSession`** — also available on `auth.session.*` (Better Auth `/api/auth/*`).

Example:

```ts
const auth = createAuthClient(env.AUTH, request);
const session = await auth.session.get();
await auth.profile.update({ name: displayName });
await auth.admin.listUsers();
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
- Chat WebSocket: **web → chatroom worker → Chatroom DO**. The **chatroom worker** resolves identity via **`env.AUTH`** (`getSession` + profile display name); the web worker only forwards cookies and the internal secret.
- **Human admin** = `user.role === "admin"` (browser `/admin/*`: trusted origins, user list with editable display names). **Machine admin** = `AUTH_ADMIN_SECRET` header (never in client bundles).

## Commands

```bash
bun run db:generate:auth   # after editing packages/auth-db/src/schema.ts
bun run typegen            # after routes or alchemy binding changes
bun run typecheck
```
