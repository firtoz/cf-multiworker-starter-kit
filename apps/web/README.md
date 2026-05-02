# Web app

React Router 7 application deployed on Cloudflare Workers.

**Docs map:** [README.md](../../README.md) (monorepo quick start + building a product) · this file (web app only) · [AGENTS.md](../../AGENTS.md) (index to rules/skills) · [CONTRIBUTING.md](../../CONTRIBUTING.md) (contribution/PRs).

**Skills** under [agents/skills/](../../agents/skills/) are project-specific playbooks, not marketing docs.

## Dependencies

**Durable Objects / services:** `chatroom-do` (WebSockets / Socka; `/chat` and `/api/ws/*` in `workers/app.ts`), `ping-do` (typed Hono DO example), and `other-worker` (service binding example).

**Packages:** `cf-starter-db` (D1 + Drizzle for `/visitors`), `cf-starter-chat-contract` (shared Socka types).

**How bindings work:** **`apps/web/alchemy.run.ts`** declares app bindings and imports worker/DO resources from dependency packages' `./alchemy` exports. Types: **`types/env.d.ts`** (`typeof web["Env"]`). After route edits, **`bun run typegen`** from the repo root.

## Key files

- `app/routes/` - Route components (home, visitors, chat, …)
- `app/root.tsx` - Root layout with dark mode support
- `app/entry.server.tsx` - SSR entry + 103 Early Hints for CSS
- `workers/app.ts` - Cloudflare Worker (SSR + WebSocket forward to `ChatroomDo`)
- `alchemy.run.ts` - Web Alchemy app, D1 binding, and imported worker/DO bindings
- `types/env.d.ts` - Cloudflare `env` types from the exported `web` resource

## Common tasks

### 1. Add a route (register it, then implement)

File-based route modules are listed explicitly in `app/routes.ts`. A new `app/routes/foo.tsx` does nothing until you add it there.

1. In **`app/routes.ts`**, add a line such as: `route("my-feature", "routes/my-feature.tsx")` (path segment → file under `app/routes/`).
2. Create **`app/routes/my-feature.tsx`**. After edits, run **`bun run typegen`** from the repo root so `./+types/my-feature` exists.
3. Export **`RoutePath`** and use **`Promise<MaybeError<...>>`** in loaders, matching the rest of this app:

```tsx
// app/routes.ts — register the route
// route("my-feature", "routes/my-feature.tsx"),

// app/routes/my-feature.tsx
import { env } from "cloudflare:workers";
import { type MaybeError, success } from "@firtoz/maybe-error";
import type { RoutePath } from "@firtoz/router-toolkit";
import { incrementSiteVisits } from "cf-starter-db";
import type { Route } from "./+types/my-feature";

export const route: RoutePath<"/my-feature"> = "/my-feature";

export async function loader(
	_args: Route.LoaderArgs,
): Promise<MaybeError<{ count: number }>> {
	const count = await incrementSiteVisits(env.DB);
	return success({ count });
}

export default function MyFeature({ loaderData }: Route.ComponentProps) {
	if (!loaderData.success) {
		return <p>{loaderData.error}</p>;
	}
	return <div>Visits: {loaderData.result.count}</div>;
}
```

See [agents/skills/routing/SKILL.md](../../agents/skills/routing/SKILL.md).

### 2. Add a form (internal app flows vs external clients)

For internal React UI submissions, prefer `formAction`, `useDynamicSubmitter`, and `await submitter.submitJson(...)`. Do not reach for plain HTML forms unless you intentionally want browser-native form behavior.

```tsx
type RouteMod = typeof import("./my-feature");
const submitter = useDynamicSubmitter<RouteMod>("/my-feature");
await submitter.submitJson({ name });
```

For external clients, terminal smoke tests, or plain HTML forms that POST to an **index route**, React Router requires the `?index` target:

- Internal app flow: `useDynamicSubmitter<RouteMod>("/some-route").submitJson(...)`
- Plain form to index route: `action="/?index"`
- Terminal test: `POST /?index`, not `POST /`

Avoid teaching new app features to POST plain forms to index routes. Prefer a non-index resource route such as `/sessions/new` for create/join endpoints that external clients must call. See [agents/skills/form-submissions/SKILL.md](../../agents/skills/form-submissions/SKILL.md).

### 3. Wire a new DO or worker into the web app

Do not duplicate the monorepo checklist here. After **`bunx turbo gen durable-object`** (or copying an existing `durable-objects/*` package), follow the root [README.md](../../README.md) section **Adding workers**, then:

- [agents/skills/cf-durable-object-package/SKILL.md](../../agents/skills/cf-durable-object-package/SKILL.md) — package layout and `alchemy.run.ts`
- [agents/skills/cf-web-alchemy-bindings/SKILL.md](../../agents/skills/cf-web-alchemy-bindings/SKILL.md) — `apps/web/package.json` workspace dep, `alchemy.run.ts` bindings, `bun run typegen`

Example: call a DO’s Hono surface with `honoDoFetcherWithName(env.PingDo, "demo")` (see existing routes such as `ping-do`).

### 4. Add a WebSocket-backed route

Handle Worker upgrade/forwarding paths before React Router in `workers/app.ts`, and keep the client URL prefix exactly aligned with the worker prefix. Do not intercept Vite HMR WebSockets; the Cloudflare Vite plugin already ignores upgrades with Vite HMR protocols.

```ts
const MY_WS_PREFIX = "/api/my-feature/ws/";

if (url.pathname.startsWith(MY_WS_PREFIX)) {
	const id = sanitizeMyFeatureId(url.pathname.slice(MY_WS_PREFIX.length));
	const stub = this.env.MyFeatureDo.getByName(id);
	const forward = new URL(request.url);
	forward.pathname = "/websocket";
	return stub.fetch(new Request(forward.toString(), request));
}
```

Conventions:

- Worker upgrade paths run before `requestHandler(...)`.
- Client URL builders and worker prefixes must match exactly.
- The Durable Object receives forwarded path `/websocket`.
- If the DO requires auth between workers, add/verify internal headers before forwarding.

### 5. Respect the SSR/browser boundary

React Router routes render on the server. Do not access `window`, `document`, `WebSocket`, `canvas`, `localStorage`, or DOM APIs during module scope, loaders/actions, component render, or SSR-running `useMemo`.

Safe places:

- `useEffect`
- Event handlers
- Client-only wrappers
- Guarded browser-only code

WebSocket URL helpers may use `window.location`, but only call them from `useEffect` or client-only handlers. If helper output is needed earlier, pass an origin from a client-only context instead.

### 6. Rename the project

1. Update package names and user-facing copy.
2. Choose stable worker names in each package’s `alchemy.run.ts` when another worker refers to it by service binding.
3. Update `package.json` → `name` field.
4. Run `bun run typegen` from root.

### 7. Add environment variables

**Development:** Run root **`bun run setup`** / **`setup:local`** once (interactive **variable browser** in a TTY, or **`-- --yes`** / **`CI=true`** for auto-generated Alchemy + chatroom secrets only), or add values to repo-root **`.env.local`** (or optional per-package **`.env.local`**), not a plain **`.env`** — see [agents/skills/cf-workers-env-local/SKILL.md](../../agents/skills/cf-workers-env-local/SKILL.md) and root **[AGENTS.md](../../AGENTS.md)** (index):
```bash
MY_SECRET=dev-value
```

**Production:** Add to repo-root **`.env.production`** or your CI secret store. Wire the value in the relevant package `alchemy.run.ts` using `alchemy.secret(...)` when needed.

Access in code:
```tsx
import { env } from "cloudflare:workers";
console.log(env.MY_SECRET);
```

### Optional PostHog

Typed keys live in **`env.requirements.ts`**; client/helpers are optional. **Nothing runs** until you set **`POSTHOG_*`** and wire UI/bindings.

- **Stay dark:** leave **`POSTHOG_*`** unset in `.env.local` / staging / prod.
- **Remove entirely:** drop the **`posthogRequirements`** block from **`env.requirements.ts`**, remove unused components/helpers/bindings/`@posthog/*` deps — same as stripping any other demo feature.

## Development

```bash
bun run dev
```

Vite prints the local URL in the terminal (`Local:` — default port 5173, or the next free if it’s taken).

## Type generation

After changing package **`alchemy.run.ts`**, **`types/env.d.ts`**, or route files, run from the **repo root**:

```bash
bun run typegen
```

This runs **`react-router typegen`** (via Turbo) for route types. Cloudflare **`env`** types come from **`types/env.d.ts`** + package-local Alchemy resources ([Alchemy type-safe bindings](https://alchemy.run/concepts/bindings/#type-safe-bindings)); there is no `wrangler types` step in this stack.

In this package only:

```bash
bun run rr-typegen  # React Router typegen
```

## Deploy

From the **repo root**, use stage-specific graphs (full monorepo — web + D1 + workers):

```bash
bun run deploy:prod      # .env.production, STAGE=prod
bun run deploy:staging   # .env.staging, STAGE=staging
# Preview: CI sets STAGE=pr-<n> and runs deploy:preview
```

Each deployable package runs **`alchemy deploy --app <package-id>`** with the same **`STAGE`**. See [agents/skills/cf-starter-workflow/SKILL.md](../../agents/skills/cf-starter-workflow/SKILL.md), root **`AGENTS.md`**, and root **`README.md`**.
