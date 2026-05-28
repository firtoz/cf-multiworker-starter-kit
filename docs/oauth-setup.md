# OAuth sign-in (Google & GitHub)

This starter kit ships with **Better Auth** on the `auth-worker`. Email/password always works; **Google** and **GitHub** are optional — set credentials in env and the **Continue with Google / GitHub** buttons appear on `/login`.

**Related:** [Auth worker checklist](../agents/skills/cf-auth-setup/SKILL.md) · [`.env.example`](../.env.example) (auth section) · [GitHub Environments sync](github-admin.md)

## What you configure

| Env key | Where it comes from |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Google Cloud Console → OAuth client |
| `GOOGLE_CLIENT_SECRET` | Same OAuth client |
| `GITHUB_CLIENT_ID` | GitHub → OAuth App |
| `GITHUB_CLIENT_SECRET` | Same OAuth App |

Both ID **and** secret must be non-empty for a provider to enable. The auth worker exposes availability at `GET /api/auth/providers`; the login page reads that via `@internal/auth-client`.

No app code changes are required — only env + provider console setup.

## Prerequisites (required even for OAuth-only)

In repo-root **`.env.local`** (and staging/production dotfiles when you deploy):

| Key | Purpose |
| --- | --- |
| `BETTER_AUTH_SECRET` | Session signing — `openssl rand -base64 32` |
| `AUTH_ADMIN_SECRET` | Machine admin API (trusted origins automation) |
| `AUTH_BOOTSTRAP_ADMIN_EMAILS` | Comma-separated emails granted `admin` on first login |

Run:

```bash
bun run setup:local
```

Then restart dev after adding OAuth keys: `bun run dev`.

## Step 0 — Know your web origin (OAuth callbacks)

OAuth **redirect / callback URLs** must match your **web app origin** exactly — the same host users open in the browser. Auth is proxied at **`/api/auth/*`** on the web worker (email, OAuth, and anonymous chat all use these same-origin routes).

Alchemy sets the auth worker **`AUTH_BASE_URL`** binding to that public web URL at dev/deploy time (there is **no** dotfile key for the URL).

**Resolution order** (first match wins):

1. **Local dev** — `https://<PRODUCT_PREFIX>-web.localhost` (Portless; stock prefix is `starter` → `https://starter-web.localhost`)
2. **`AUTH_DOMAINS`** — first hostname (optional dedicated auth host, e.g. `auth.example.com`)
3. **`WEB_DOMAINS`** — first hostname (typical custom-domain setup; auth is proxied on the web worker at `/api/auth/*`)
4. **workers.dev** — inferred web worker URL when no custom domains are set (needs Cloudflare API creds at deploy)

**Default recommendation:** use the **web-proxy** pattern — set `WEB_DOMAINS` for production, or rely on workers.dev for staging-only stacks. Skip `AUTH_DOMAINS` unless you intentionally split auth onto its own hostname.

### Callback URL pattern

For each environment, register:

```text
https://<auth-base-host>/api/auth/callback/google
https://<auth-base-host>/api/auth/callback/github
```

Examples:

| Environment | Auth base URL | Google callback |
| --- | --- | --- |
| Local (stock prefix) | `https://starter-web.localhost` | `https://starter-web.localhost/api/auth/callback/google` |
| Custom domain | `https://app.example.com` | `https://app.example.com/api/auth/callback/google` |
| Dedicated auth host | `https://auth.example.com` | `https://auth.example.com/api/auth/callback/google` |

Replace `google` with `github` for GitHub.

**Important:** Browsers and OAuth consoles must use the **web** origin in local dev — **not** the auth worker’s direct bind address (e.g. `http://127.0.0.1:8784`). Auth is forwarded from the web worker at `/api/auth/*`.

If you renamed the product, update **`PRODUCT_PREFIX`** in [`packages/alchemy-utils/src/worker-peer-scripts.ts`](../packages/alchemy-utils/src/worker-peer-scripts.ts) first — the local Portless hostname follows it.

---

## GitHub — step by step

### 1. Create an OAuth App

1. Open [GitHub → Settings → Developer settings → OAuth Apps](https://github.com/settings/developers).
2. **Register a new OAuth application** (or edit an existing one).
3. Fill in:
   - **Application name** — e.g. `My App (local)` / `My App (production)`
   - **Homepage URL** — your site origin, e.g. `https://starter-web.localhost` or `https://app.example.com`
   - **Authorization callback URL** — `https://<web-origin>/api/auth/callback/github` (see [Step 0](#step-0--know-your-web-origin-oauth-callbacks))

4. Click **Register application** (or **Update application**).

### 2. Copy credentials

On the OAuth App page:

- **Client ID** → `GITHUB_CLIENT_ID`
- **Generate a new client secret** → `GITHUB_CLIENT_SECRET` (copy once; GitHub shows it only briefly)

### 3. Add to env

In **`.env.local`**:

```bash
GITHUB_CLIENT_ID=Ov23li...
GITHUB_CLIENT_SECRET=...
```

Re-run `bun run setup:local` if you use the setup browser, then `bun run dev`.

### 4. Multiple environments

Use **separate OAuth Apps** per environment (local / staging / production), **or** add every callback URL to one app. Each callback must match that environment’s auth base URL.

For staging/production, put the same keys in **`.env.staging`** / **`.env.production`**, then sync to GitHub Environments:

```bash
bun run setup:staging && bun run github:sync:staging
# or
bun run setup:prod && bun run github:sync:prod
```

### 5. Verify

1. Open `/login` — **Continue with GitHub** should appear.
2. Complete sign-in → land on `/` (or your `redirectTo`).
3. Visit `/account` — profile should show your GitHub identity.
4. If your GitHub **primary email** is listed in `AUTH_BOOTSTRAP_ADMIN_EMAILS`, `/admin` should work after first login.

---

## Google — step by step

### 1. Google Cloud project & consent screen

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a **project**.
3. **APIs & Services → OAuth consent screen**:
   - Choose **External** (or **Internal** for Workspace-only apps).
   - Fill required app info (name, support email, developer contact).
   - **Scopes** — for basic sign-in, the default `openid`, `email`, and `profile` scopes (Better Auth requests these) are enough.
   - Add **Test users** while the app is in **Testing** mode (only those accounts can sign in until you publish).

### 2. Create OAuth client credentials

1. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type: **Web application**.
3. **Authorized JavaScript origins** (recommended):
   - `https://<auth-base-host>` (same host as Step 0, no path)
4. **Authorized redirect URIs**:
   - `https://<auth-base-host>/api/auth/callback/google`
5. Create and copy **Client ID** and **Client secret**.

### 3. Add to env

In **`.env.local`**:

```bash
GOOGLE_CLIENT_ID=123456789-....apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
```

Re-run `bun run setup:local` if needed, then `bun run dev`.

### 4. Multiple environments

Same as GitHub: separate OAuth clients per environment, or one client with every origin + redirect URI listed.

Sync staging/production secrets with `github:sync:staging` / `github:sync:prod` after updating dotfiles.

### 5. Publish (production)

While the consent screen is **Testing**, only test users can sign in. Before opening to all users:

1. Complete Google’s verification requirements if you use sensitive scopes.
2. **OAuth consent screen → Publish app**.

### 6. Verify

1. `/login` shows **Continue with Google**.
2. Sign in → `/account` shows your Google profile.
3. Bootstrap admin email (if configured) grants `/admin` on first login with that email.

---

## Staging & production checklist

1. Core auth secrets in the stage dotfile (`BETTER_AUTH_SECRET`, `AUTH_ADMIN_SECRET`, bootstrap emails).
2. OAuth credentials for that stage’s auth base URL.
3. Provider console callback URLs match **that** stage’s host (not localhost).
4. `bun run github:sync:staging` or `github:sync:prod` so CI deploy jobs receive secrets.
5. Deploy, then smoke-test `/login` on the live URL.

**No auth URL is synced to GitHub** — Alchemy derives it from domains or workers.dev at deploy time. Register OAuth callbacks **after** you know the deployed web URL (or set `WEB_DOMAINS` before first deploy).

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| No Google/GitHub button on `/login` | Missing or empty `*_CLIENT_ID` / `*_CLIENT_SECRET` | Set both keys; restart `bun run dev` |
| Provider error: redirect URI mismatch | Callback URL in console ≠ resolved auth URL | Fix console URL; check `WEB_DOMAINS` / `AUTH_DOMAINS` / Portless hostname |
| **403** on sign-in (especially anonymous → OAuth) | Untrusted `Origin` | Add origin in `/admin/origins` or `AUTH_SEED_ORIGINS`; see [cf-auth-setup](../agents/skills/cf-auth-setup/SKILL.md) |
| Google “Access blocked” / app not verified | Consent screen still in **Testing** | Add your account as a test user, or publish the app |
| Signed in but not admin | Email not in bootstrap list | Add email to `AUTH_BOOTSTRAP_ADMIN_EMAILS` **before** first login, or promote via admin UI / DB |

---

## Architecture (short)

- Browser hits **`/api/auth/*`** on the **web** worker → forwarded to **`env.AUTH`** (`auth-worker` service binding).
- Better Auth `socialProviders` in [`durable-objects/auth-worker/src/auth.ts`](../durable-objects/auth-worker/src/auth.ts) enable Google/GitHub when env is set.
- Login links are built in [`apps/web/app/components/auth/LoginPanel.tsx`](../apps/web/app/components/auth/LoginPanel.tsx).

For anonymous chat guests, signing in with OAuth **links** the anonymous account; chat history in Durable Object SQLite is **not** migrated automatically.
