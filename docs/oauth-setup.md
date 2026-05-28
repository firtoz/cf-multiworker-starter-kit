# OAuth sign-in (Google & GitHub)

This starter kit ships with **Better Auth** on the `auth-worker`. Email/password always works; **Google** and **GitHub** are optional — set credentials in env and the **Continue with Google / GitHub** buttons appear on `/login`.

**Related:** [Auth worker checklist](../agents/skills/cf-auth-setup/SKILL.md) · [`.env.example`](../.env.example) (auth section) · [GitHub Environments sync](github-admin.md)

## Local dev: Portless + Google (loopback OAuth proxy)

Default **`bun run dev`** uses **Portless** (`https://starter-web.localhost`). **Google’s console rejects `*.localhost`** redirect URIs — so you register **loopback** only:

```text
http://127.0.0.1:5173/api/auth/callback/google
```

(Match **`PORT`** in `.env.local` if you change it.)

With **both** Portless (default) and **`GOOGLE_*`** set, the auth worker enables Better Auth’s **`oAuthProxy`** plugin for **Google only** (including **`/link-social`** on `/account`): you keep browsing on Portless, but the OAuth redirect URI sent to **Google** uses **`127.0.0.1`**. **GitHub** is unchanged — register **`https://<prefix>-web.localhost/api/auth/callback/github`** on your GitHub OAuth app (GitHub allows `*.localhost`; do **not** add the loopback GitHub URL unless you use `LOCAL_PORTLESS=off`). **Sign-in with Google** finishes via **`/oauth-proxy-callback`**; **Connect Google on `/account`** links to your existing session (no new user). After Google returns to loopback, sign-in redirects to **`https://<prefix>-web.localhost/api/auth/oauth-proxy-callback`** (not `https://127.0.0.1` — HTTP-only, causes `ERR_SSL_PROTOCOL_ERROR`).

| Mode | Browse at | Google redirect URI in console | GitHub callback URL in OAuth app |
| --- | --- | --- | --- |
| Portless + `GOOGLE_*` (default trick) | `https://starter-web.localhost` | `http://127.0.0.1:5173/api/auth/callback/google` | `https://starter-web.localhost/api/auth/callback/github` |
| `LOCAL_PORTLESS=off` | `http://127.0.0.1:5173` | Same loopback URL | `http://127.0.0.1:5173/api/auth/callback/github` |

**`LOCAL_PORTLESS=off`** is still valid if you prefer one origin everywhere (no proxy). See [§2](#2-google--local-dev--what-actually-works).

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

1. **Local dev + Portless (default)** — `https://<PRODUCT_PREFIX>-web.localhost` (GitHub ✅ · Google ✅ with loopback callback in Google — see [Local dev: Portless + Google](#local-dev-portless--google-loopback-oauth-proxy))
2. **Local dev + `LOCAL_PORTLESS=off`** — `http://127.0.0.1:<port>` (Google ✅)
3. **`AUTH_DOMAINS`** — first hostname (optional dedicated auth host, e.g. `auth.example.com`)
4. **`WEB_DOMAINS`** — first hostname (typical custom-domain setup; auth is proxied on the web worker at `/api/auth/*`)
5. **workers.dev** — inferred web worker URL when no custom domains are set (needs Cloudflare API creds at deploy)

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
| Local + Portless (default) | `https://starter-web.localhost` | GitHub ✅ · Google ✅ (proxy; register loopback callback in Google) |
| Local + `LOCAL_PORTLESS=off` | `http://127.0.0.1:5173` | Google ✅ · GitHub ✅ (single origin) |
| Staging / production | `https://app.example.com` or workers.dev | Google ✅ and GitHub ✅ |
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

Google’s console has two separate pieces. Finishing **Getting started** (consent / branding) is **not** enough — this app needs an **OAuth client** (Client ID + secret). Until you create one, **OAuth overview** shows *“You haven’t configured any OAuth clients for this project yet.”* and `/login` will not show Google.

**Where to work in the console:** pick your project (top bar) → left nav **Google Auth Platform** (or search “OAuth” in the top search box). You’ll see **Overview**, **Branding**, **Audience**, **Clients**, etc.

### 1. Project & consent (Getting started / Branding / Audience)

If you already ran **Getting started**, you can skip most of this and only confirm the items below.

1. Open [Google Cloud Console](https://console.cloud.google.com/) and select your **project** (e.g. “CF Multiworker Starter Kit”).
2. Go to **Google Auth Platform** (hamburger menu → **APIs & Services** may also show **OAuth consent screen** on older layouts — same project, same data).
3. **Branding** (replaces much of the old “OAuth consent screen” wizard):
   - App name, support email, developer contact — required for sign-in.
   - User type **External** (public) or **Internal** (Google Workspace only).
4. **Audience**:
   - While publishing status is **Testing**, only accounts listed as **Test users** can sign in. Add the Google account(s) you’ll use locally.
   - Scopes: basic sign-in uses `openid`, `email`, `profile` (Better Auth requests these; defaults are usually fine).
5. You do **not** need extra APIs enabled for “Sign in with Google” on a web app — skip API Library unless Google prompts you for something specific.

### 2. Google + local dev — what actually works

**Google’s console only accepts redirect URIs that are either:**

1. **Loopback** — `http://localhost:<port>` or `http://127.0.0.1:<port>` (what Google documents for local testing), or  
2. **A real public hostname** — `https://app.example.com`, a **workers.dev** deploy URL, a tunnel URL, etc.

It **rejects** special/dev TLDs such as **`.localhost`**, **`.test`**, **`.local`**, and bare hostnames like `myapp.local` — you’ll see:

> *Invalid origin: Must end with a public top-level domain (such as .com or .org).*

**GitHub** is more permissive (`https://starter-web.localhost` works). **Google is not.**

**Authorized JavaScript origins** can stay **empty** for this app (server redirect flow). You only need a valid **Authorized redirect URI**.

#### Option A — Portless + loopback proxy (default when `GOOGLE_*` is set)

Keep Portless on. Register **`http://127.0.0.1:5173/api/auth/callback/google`** in Google Cloud (not `https://starter-web.localhost`). Click **Continue with Google** on `https://starter-web.localhost` — the auth worker proxies OAuth through loopback automatically.

#### Option B — Plain loopback only (`LOCAL_PORTLESS=off`)

Best when you want a single origin (no proxy) on your laptop.

1. In **`.env.local`**:
   ```bash
   LOCAL_PORTLESS=off
   ```
2. Restart **`bun run dev`**. Open the URL Vite prints — usually **`http://127.0.0.1:5173`** (or `http://localhost:5173`).
3. In the Google client, **Authorized redirect URIs** (match your port exactly):
   ```text
   http://127.0.0.1:5173/api/auth/callback/google
   ```
   If your dev server uses another port, copy it from the terminal / browser bar. You can add both `localhost` and `127.0.0.1` entries if you switch between them.
4. On your **GitHub** OAuth app, **add** the same loopback callback (keep `starter-web.localhost` too if you still use Portless sometimes):
   ```text
   http://127.0.0.1:5173/api/auth/callback/github
   ```

Trade-off: no Portless HTTPS locally while this is set; cookies and auth use plain HTTP on loopback (fine for dev).

#### Option C — Keep Portless for GitHub, use staging for Google

1. Develop day-to-day with default Portless → **`https://starter-web.localhost`** + GitHub + email.
2. Configure Google only on a **deployed** URL (PR preview or staging):
   - Deploy once, note the web URL (e.g. `https://<worker>.workers.dev` or `WEB_DOMAINS`).
   - Register `https://<that-host>/api/auth/callback/google` in Google Cloud.
   - Put `GOOGLE_*` in **`.env.staging`** and test sign-in on the live preview.

No local Google button until you add loopback (Option A) or use staging (Option C).

#### Option D — HTTPS tunnel with a public hostname

Use when you want **HTTPS** and a **real TLD** locally (e.g. shareable link, closer to prod).

1. Run the app (Portless or `LOCAL_PORTLESS=off` — tunnel forwards to whatever port Vite uses, often `5173`).
2. Start a tunnel to that port, for example:
   - [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) (`cloudflared tunnel --url http://127.0.0.1:5173`)
   - [ngrok](https://ngrok.com/) (`ngrok http 5173`)
3. Copy the **https** public URL (e.g. `https://abc123.ngrok-free.app`).
4. Google client redirect URI:
   ```text
   https://abc123.ngrok-free.app/api/auth/callback/google
   ```
5. Open the app **through the tunnel URL** when testing Google (not `starter-web.localhost`).
6. If sign-in returns **403** / untrusted origin, add the tunnel origin in **`/admin/origins`** or **`AUTH_SEED_ORIGINS`** in `.env.local` (comma-separated `https://...` origins).

Tunnel URLs change when you restart the tunnel unless you use a reserved ngrok domain / named Cloudflare tunnel.

#### Option E — Domain you own + `/etc/hosts`

1. Pick a hostname you control, e.g. `dev.yourdomain.com`.
2. Point it to loopback in `/etc/hosts`:
   ```text
   127.0.0.1 dev.yourdomain.com
   ```
3. Register in Google:
   ```text
   https://dev.yourdomain.com/api/auth/callback/google
   ```
4. You need HTTPS on that host (reverse proxy, tunnel, or local TLS) and trusted origins configured — more setup than Option A; use if you already standardize on a dev subdomain.

#### What does **not** work in Google’s form (local)

| Approach | Why |
| --- | --- |
| `https://starter-web.localhost` in Google console | Google rejects `*.localhost` — register **`http://127.0.0.1:5173/...`** instead (proxy handles the rest) |
| `PORTLESS_TLD=test` → `https://starter-web.test` | `.test` is reserved; Google rejects it like `.localhost` |
| `myapp.local`, `.dev` on loopback | `.dev` has HSTS on the real internet; avoid for local fake domains |
| `nip.io` / `sslip.io` | Unreliable in Google’s validator; loopback is simpler |

**Practical recommendation:** use **Option A** (Portless + loopback callback in Google) for day-to-day local Google, **Option B** if you want one origin, or **Option C** for Google on staging only.

### 3. Create the OAuth client (required — fixes “no OAuth clients” on Overview)

This is the step that actually produces `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

**From OAuth overview:**

1. **Overview → Create OAuth client** or **Clients → Create client**.
2. Application type: **Web application**.
3. **Name** — e.g. `starter local web`.
4. **Authorized JavaScript origins** — leave empty, **or** add your origin from the table above (no path) if Google accepts it for your chosen option.
5. **Authorized redirect URIs** — must match your chosen option in [§2](#2-google--local-dev--what-actually-works), e.g. `http://127.0.0.1:5173/api/auth/callback/google` for loopback dev.
6. **Create** → copy **Client ID** and **Client secret** (secret shown once).

**Older console path (same result):** **APIs & Services → Credentials → Create credentials → OAuth client ID** → **Web application** → same origins and redirect URI as above.

After this, **Overview → Metrics** should stop saying “no OAuth clients,” and **Clients** should list your new Web client.

### 4. Add to env

In **`.env.local`**:

```bash
GOOGLE_CLIENT_ID=123456789-....apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
```

Re-run `bun run setup:local` if needed, then `bun run dev`.

### 5. Multiple environments

Same as GitHub: separate OAuth clients per environment, or one client with every origin + redirect URI listed.

Sync staging/production secrets with `github:sync:staging` / `github:sync:prod` after updating dotfiles.

### 6. Publish (production)

While the app is in **Testing**, only **Test users** (Audience) can sign in. Before opening to everyone:

1. Complete Google’s verification if you use sensitive scopes beyond basic profile/email.
2. **Audience** (or legacy **OAuth consent screen**) → **Publish app**.

### 7. Verify

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
| Google “Access blocked” / app not verified | Consent screen still in **Testing** | **Audience → Test users** — add your Google account, or publish the app |
| OAuth overview: “no OAuth clients yet” | Only finished Getting started / branding | **Overview → Create OAuth client** or **Clients → Create client** (Web application) — see [§3](#3-create-the-oauth-client-required--fixes-no-oauth-clients-on-overview) |
| Google: “Invalid origin” for `*.localhost` / `*.test` | Google only allows loopback or real public domains | **`LOCAL_PORTLESS=off`** + `http://127.0.0.1:5173/...`, tunnel, or staging — see [§2](#2-google--local-dev--what-actually-works) |
| Created client but no button on `/login` | Env keys missing or dev not restarted | Set **both** `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.local`, then `bun run dev` |
| Signed in but not admin | Email not in bootstrap list | Add email to `AUTH_BOOTSTRAP_ADMIN_EMAILS` **before** first login, or promote via admin UI / DB |

---

## Architecture (short)

- Browser hits **`/api/auth/*`** on the **web** worker → forwarded to **`env.AUTH`** (`auth-worker` service binding).
- Better Auth `socialProviders` in [`workers/auth-worker/src/auth.ts`](../workers/auth-worker/src/auth.ts) enable Google/GitHub when env is set.
- Login links are built in [`apps/web/app/components/auth/LoginPanel.tsx`](../apps/web/app/components/auth/LoginPanel.tsx).

For anonymous chat guests, signing in with OAuth **links** the anonymous account; chat history in Durable Object SQLite is **not** migrated automatically.
