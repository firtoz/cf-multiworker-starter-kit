# OAuth sign-in (Google & GitHub)

This starter kit ships with **Better Auth** on the `auth-worker`. Email/password always works; **Google** and **GitHub** are optional — set credentials in env and the **Continue with Google / GitHub** buttons appear on `/login`.

**Related:** [Auth worker checklist](../agents/skills/cf-auth-setup/SKILL.md) · [`.env.example`](../.env.example) (auth section) · [GitHub Environments sync](github-admin.md) · [Multi-environment (local / staging / prod)](#multi-environment-setup-local-staging-production)

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
| `GH_CLIENT_ID` | GitHub → OAuth App |
| `GH_CLIENT_SECRET` | Same OAuth App |

Use the **`GH_`** prefix (not **`GITHUB_`**) so `bun run github:sync:*` can push these to GitHub Environment secrets — [Actions rejects secret names starting with `GITHUB_`](https://docs.github.com/en/rest/actions/secrets#create-or-update-an-environment-secret).

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

Use a [GitHub OAuth App](https://github.com/settings/developers) (Developer settings → **OAuth Apps**). Better Auth expects `GH_CLIENT_ID` and `GH_CLIENT_SECRET` ([Better Auth GitHub](https://www.better-auth.com/docs/authentication/github)).

### 1. Create an OAuth App

1. Open [GitHub → Settings → Developer settings → OAuth Apps](https://github.com/settings/developers).
2. **Register a new OAuth application** (or edit an existing one).
3. Fill in:
   - **Application name** — e.g. `My App (local)` / `My App (staging)` / `My App (production)`
   - **Homepage URL** — that stage’s web origin, e.g. `https://starter-web.localhost` or `https://starter-frontend-web-prod.lunix-ai.workers.dev`
   - **Authorization callback URL** — `https://<web-origin>/api/auth/callback/github` (see [Step 0](#step-0--know-your-web-origin-oauth-callbacks))

4. Click **Register application** (or **Update application**).

**One callback URL per OAuth App** — for local + staging + production, create **three** OAuth Apps (see [§4 Multiple environments](#4-multiple-environments)).

### 2. Copy credentials

On the OAuth App page:

- **Client ID** → `GH_CLIENT_ID`
- **Generate a new client secret** → `GH_CLIENT_SECRET` (copy once; GitHub shows it only briefly)

### 3. Add to env

In **`.env.local`**:

```bash
GH_CLIENT_ID=Ov23li...
GH_CLIENT_SECRET=...
```

Re-run `bun run setup:local` if you use the setup browser, then `bun run dev`.

### 4. Multiple environments

**Unlike Google**, a classic [GitHub OAuth App](https://github.com/settings/developers) has **only one** **Authorization callback URL** in the form. You cannot list local, staging, and production hosts on the same app.

**Recommended:** create **one OAuth App per environment** (e.g. `My App (local)`, `My App (staging)`, `My App (production)`), each with that stage’s callback URL, and put the matching **`GH_CLIENT_ID`** / **`GH_CLIENT_SECRET`** in the right dotfile:

| Stage | Callback URL (example) | Env file |
| --- | --- | --- |
| Local + Portless | `https://<prefix>-web.localhost/api/auth/callback/github` | `.env.local` |
| Local + `LOCAL_PORTLESS=off` | `http://127.0.0.1:5173/api/auth/callback/github` | `.env.local` |
| Staging | `https://<staging-web-host>/api/auth/callback/github` | `.env.staging` |
| Production | `https://<prod-web-host>/api/auth/callback/github` | `.env.production` |

GitHub’s [redirect URL rules](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#redirect-urls) allow extra paths **under** the registered callback on the **same host and port** — that does **not** help across `*.localhost`, `workers.dev`, and your prod domain. You need **separate OAuth Apps** (or test GitHub on one host only).

For staging/production, sync secrets after editing dotfiles:

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
4. **Audience** ([Google Auth Platform → Audience](https://console.cloud.google.com/auth/audience)):
   - **Testing** — only **Test users** you list can sign in. Use this while building locally and on staging before you are ready for the public.
   - **In production** (published) — any Google user can sign in (subject to Google verification if you request sensitive scopes). Move here when staging smoke tests pass and you are ready for real users.
   - Scopes: basic sign-in uses `openid`, `email`, `profile` (Better Auth requests these; defaults are usually fine).
   - **Local + staging tip:** keep **Testing** until you have verified deploys; add your own Google account (and teammates’) under **Test users**.
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

See [Multi-environment setup](#multi-environment-setup-local-staging-production) for a full playbook (one Google client vs several, dotfiles, GitHub sync, and callback URLs per stage).

### 6. Publish (production)

While **Audience** is **Testing**, only **Test users** can sign in — even if redirect URIs and env are correct on staging.

Before opening to everyone:

1. Complete Google’s verification if you use sensitive scopes beyond basic profile/email.
2. **Audience** → set publishing status to **In production** (or **Publish app** on older layouts).
3. Confirm **Authorized redirect URIs** on your Web client include every live host (staging + production), not only loopback.

### 7. Verify

1. `/login` shows **Continue with Google**.
2. Sign in → `/account` shows your Google profile.
3. Bootstrap admin email (if configured) grants `/admin` on first login with that email.

---

## Multi-environment setup (local, staging, production)

Use this when you want OAuth on **laptop + staging + production** (or PR previews). No app code changes — only env, provider consoles, and deploy URLs.

### How stages map to files and deploys

| Stage | `STAGE` / command | Env dotfile | GitHub Environment secrets |
| --- | --- | --- | --- |
| Local | `bun run dev` (`local`) | `.env.local` | (optional; usually not synced) |
| Staging | `bun run deploy:staging` | `.env.staging` | `staging` via `bun run github:sync:staging` |
| PR preview | CI deploy (`pr-<n>`) | `.env.staging` (same file) | `staging` |
| Production | `bun run deploy:prod` | `.env.production` | `production` via `bun run github:sync:prod` |

**Auth public URL** for each deploy is computed at deploy time (not a dotfile key). See [Step 0](#step-0--know-your-web-origin-oauth-callbacks).

### Google — one client, many redirect URIs

Google **Web application** clients allow **multiple** **Authorized redirect URIs**. Register every stage on **one** Google client, then use the **same** `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env.local`, `.env.staging`, and `.env.production` (sync with `github:sync:*`).

| Environment | Browse / auth base URL (typical) | Google redirect URI |
| --- | --- | --- |
| Local + Portless | `https://<prefix>-web.localhost` | `http://127.0.0.1:5173/api/auth/callback/google` |
| Staging (workers.dev) | `https://<web-worker>-staging.<account>.workers.dev` | `https://<that-host>/api/auth/callback/google` |
| Production | `https://app.example.com` or workers.dev | `https://<that-host>/api/auth/callback/google` |

**Example (this repo’s naming):** after `bun run deploy:staging`, the web URL might look like `https://starter-frontend-web-staging.lunix-ai.workers.dev`. Add to Google:

```text
http://127.0.0.1:5173/api/auth/callback/google
https://starter-frontend-web-staging.lunix-ai.workers.dev/api/auth/callback/google
https://<prod-host>/api/auth/callback/google
```

**Authorized JavaScript origins** (optional): origins only, no path — e.g. `https://starter-frontend-web-staging.lunix-ai.workers.dev`.

### GitHub — one OAuth App per host

Each [OAuth App](https://github.com/settings/developers) allows **one** **Authorization callback URL**. Use a separate app per stage:

| Environment | OAuth App name (example) | Authorization callback URL |
| --- | --- | --- |
| Local + Portless | `My App (local)` | `https://<prefix>-web.localhost/api/auth/callback/github` |
| Staging | `My App (staging)` | `https://<staging-web-host>/api/auth/callback/github` |
| Production | `My App (production)` | `https://<prod-web-host>/api/auth/callback/github` |

Put **that app’s** `GH_CLIENT_ID` / `GH_CLIENT_SECRET` in the matching dotfile (`.env.local`, `.env.staging`, `.env.production`). Replace `<prefix>` with **`PRODUCT_PREFIX`** from [`packages/alchemy-utils/src/worker-peer-scripts.ts`](../packages/alchemy-utils/src/worker-peer-scripts.ts).

**Template repo examples:** `https://starter-web.localhost/...`, `https://starter-frontend-web-staging.lunix-ai.workers.dev/...`, `https://starter-frontend-web-prod.lunix-ai.workers.dev/...`.

### Strategy B — Separate Google clients too

Optional: separate Google clients per stage (isolated secrets or test Audience apps). Same dotfile / `github:sync` pattern as GitHub — **different** `GOOGLE_*` per `.env.*` file.

### Env keys per stage (minimum)

Every stage dotfile that should show OAuth buttons needs **both** ID and secret for each provider:

```bash
BETTER_AUTH_SECRET=...
AUTH_ADMIN_SECRET=...
AUTH_BOOTSTRAP_ADMIN_EMAILS=you@example.com

GOOGLE_CLIENT_ID=....apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...

GH_CLIENT_ID=...
GH_CLIENT_SECRET=...
```

Create or edit dotfiles:

```bash
bun run setup:local      # → .env.local
bun run setup:staging    # → .env.staging
bun run setup:prod       # → .env.production
```

Sync to GitHub (so deploy workflows receive secrets):

```bash
bun run github:sync:staging
bun run github:sync:prod
```

See [GitHub Environments](github-admin.md) for `DEPLOY_ENABLED` and protection rules.

### Discover the deployed web URL (first time)

Alchemy does **not** write the auth URL into GitHub. After the first successful deploy:

1. Read the deploy log / Cloudflare dashboard for the **web** worker URL (`apps/web`), or open the workers.dev link Alchemy prints.
2. Register OAuth callbacks using that **exact** origin (see tables above).
3. Smoke-test `https://<that-host>/login` — Google/GitHub buttons appear only if secrets are in that stage’s dotfile **and** synced to the matching GitHub Environment.

Optional: set **`WEB_DOMAINS=app.example.com`** in `.env.production` (and staging if needed) **before** deploy so the URL is stable and known up front. See [cf-workers-env-local](../agents/skills/cf-workers-env-local/SKILL.md).

### Google Audience vs redirect URIs

| Console area | What it controls |
| --- | --- |
| **Audience → Testing / In production** | **Who** may sign in (test users only vs everyone) |
| **Clients → Authorized redirect URIs** | **Which hosts** may complete OAuth (localhost, staging workers.dev, prod domain) |

You can mark **Audience** as **In production** while still adding staging + loopback URIs on one Web client — publishing affects user access, not which redirect URLs are valid.

**Recommended path:**

1. **Testing** + test users — local dev and staging deploys.
2. Register all redirect URIs (loopback + staging + prod) on one Web client.
3. Smoke-test staging on the live workers.dev URL.
4. Switch **Audience** to **In production** when ready for public Google users.

### PR previews

Same-repo PR deploys use **`STAGE=pr-<n>`** and the same GitHub Environment secrets as **staging** (`.env.staging`). Each preview gets its own workers.dev URL (e.g. `https://<prefix>-frontend-web-pr-22.<account>.workers.dev`).

**GitHub OAuth Apps allow only one Authorization callback URL** — there is no API to create or update OAuth Apps per PR. Register **staging only**:

```text
https://<staging-web-host>/api/auth/callback/github
```

**This starter kit proxies PR preview OAuth through staging** (Better Auth [`oAuthProxy`](https://www.better-auth.com/docs/plugins/oauth-proxy)):

1. User clicks **Continue with GitHub** on the PR preview URL (login or guest upgrade / **Quick connect**).
2. GitHub redirects to the **staging** callback (registered above).
3. Staging auth exchanges the code and redirects back to the PR preview with an encrypted profile.
4. The PR preview auth worker creates the session in its own D1 database (sign-in) or links the provider on the existing guest account (**`/link-social`**).

Stock Better Auth `oAuthProxy` only hooks **`/sign-in/social`**; this starter kit also patches **`/link-social`** for PR passthrough (see [`oauth-proxy-passthrough-patch.ts`](../workers/auth-worker/src/oauth-proxy-passthrough-patch.ts)). **Redeploy staging** after changing that patch — staging receives the OAuth callback before the preview finishes linking.

Requirements:

- **Staging must stay deployed** while testing OAuth on PR previews (the callback always hits staging first).
- **`BETTER_AUTH_SECRET`** must match between staging and PR previews (same GitHub Environment secret — already the case for preview deploys).
- **`GH_*`** credentials are the staging OAuth App (already synced to the `staging` Environment).

**Google on PR previews** uses the same proxy — you only need the **staging** redirect URI in Google Cloud, not each `pr-<n>` URL.

The login and guest-upgrade pages show a short notice when passthrough OAuth is active. You can still test OAuth directly on the fixed **staging** URL without the proxy hop.

**Not supported:** automatically registering a new GitHub OAuth App per PR (GitHub does not expose that API).

---

## Staging & production checklist

1. Core auth secrets in the stage dotfile (`BETTER_AUTH_SECRET`, `AUTH_ADMIN_SECRET`, `AUTH_BOOTSTRAP_ADMIN_EMAILS`).
2. **`GOOGLE_*` and `GITHUB_*`** in that stage’s dotfile (both ID and secret for each provider you want).
3. Provider console: redirect/callback URLs for **that stage’s live web host** (not `127.0.0.1` on staging/prod — loopback is local-only).
4. Google **Audience**: **Test users** while validating staging; **In production** when opening to all Google users.
5. `bun run github:sync:staging` or `github:sync:prod` so CI deploy jobs receive secrets.
6. `bun run deploy:staging` or `bun run deploy:prod`, then smoke-test `/login` and `/account` on the live URL.
7. **Connect provider** on `/account` — link errors should return to `/account?error=...` with a readable message (not `/api/auth/error`).

**No auth URL is synced to GitHub** — Alchemy derives it from `WEB_DOMAINS`, `AUTH_DOMAINS`, or workers.dev at deploy time. See [Multi-environment setup](#multi-environment-setup-local-staging-production) if the URL was unknown before the first deploy.

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
| Signed in but not admin | Email not in bootstrap list | Add email to `AUTH_BOOTSTRAP_ADMIN_EMAILS`, redeploy, then `bun run auth:sync-bootstrap-admins` (CI runs this after deploy) — or promote via admin UI / DB |

---

## Architecture (short)

- Browser hits **`/api/auth/*`** on the **web** worker → forwarded to **`env.AUTH`** (`auth-worker` service binding).
- Better Auth `socialProviders` in [`workers/auth-worker/src/auth.ts`](../workers/auth-worker/src/auth.ts) enable Google/GitHub when env is set.
- Login links are built in [`apps/web/app/components/auth/LoginPanel.tsx`](../apps/web/app/components/auth/LoginPanel.tsx).

For anonymous chat guests, signing in with OAuth **links** the anonymous account; chat history in Durable Object SQLite is **not** migrated automatically.
