# Agent instructions - web app

This file contains important guidelines for AI agents working on the React Router 7 web application.

**TL;DR:** Use **`import { env } from "cloudflare:workers"`** for bindings. **`bun run typecheck`** (repo root) runs [tsconfig.cloudflare.json](tsconfig.cloudflare.json) and [tsconfig.node.json](tsconfig.node.json) so both the app and Vite/Tailwind configs are checked.

## Worker `env` (bindings)

Use the Cloudflare Workers virtual module only:

```typescript
import { env } from "cloudflare:workers";
```

Do **not** use `context.cloudflare.env` (or similar) from React Router for bindings — types and runtime expect `cloudflare:workers`. See root [AGENTS.md](../../AGENTS.md) (skill index) and [agents/skills/cf-starter-gotchas/SKILL.md](../../agents/skills/cf-starter-gotchas/SKILL.md).

## Package Alchemy app

- Source: **`apps/web/alchemy.run.ts`** for web bindings and imported Worker/DO resources.
- Provider packages export resources through their package **`./alchemy`** export.
- Root scripts use Turbo; web dev/deploy/destroy uses **`alchemy-cli.ts`** with **`frontend`** (see **`CF_STARTER_APPS`** / **`PRODUCT_PREFIX`** in root README — **Name your product** → **Code-first infra names**).

## Routes

### Adding or editing routes

**IMPORTANT:** React Router 7 uses file-based routing with generated types.

When you want to add or edit routes:

1. **Edit the route configuration first**: Modify `app/routes.ts` to add/remove route definitions

2. **Add or modify route files**: Create or edit files in `app/routes/`
   - `app/routes/home.tsx` - Home page route
   - Add new routes following the same pattern

3. **Run typegen**: This generates the TypeScript types for your routes
   ```bash
   bun run typegen
   ```

4. **Import the generated types**: Use the generated route types in your code
   ```typescript
   import type { Route } from "./+types/my-route";
   ```

5. **Export the pathname** for `@firtoz/router-toolkit` (required for typed forms / submitters):
   ```typescript
   import { type RoutePath } from "@firtoz/router-toolkit";
   export const route: RoutePath<"/my-route"> = "/my-route";
   ```

**What this gives you:**
- Full type safety for route params, loaders, and actions
- IntelliSense for route paths and data
- Compile-time errors if you reference non-existent routes

**Never:**
- Manually edit generated type files
- Reference routes by string without using the type system
- Skip running `typegen` after adding/modifying routes
- Read Cloudflare bindings from React Router `context` instead of `import { env } from "cloudflare:workers"`

**While implementing features**, run `bun run typegen`, `bun run typecheck`, and `bun run lint` from the **monorepo root** whenever routes, package Alchemy apps, or env change — not only when finishing a task.

**Typecheck** runs **two** projects: [tsconfig.cloudflare.json](tsconfig.cloudflare.json) (app, workers, Alchemy) and [tsconfig.node.json](tsconfig.node.json) (Vite / Tailwind). [package.json](package.json) uses **`concurrently`** with **`--success all`** so both `tsgo` passes run and the step fails if **either** fails (e.g. you still see Node/Vite errors when the Cloudflare project is already red).

## Loaders and actions: `Promise<MaybeError<...>>`

- **Loaders:** return `Promise<MaybeError<YourData>>` using `success` / `fail` from `@firtoz/maybe-error`. In the component, branch on `loaderData.success` then use `loaderData.result`.
- **Actions:** `formAction` handlers already return `Promise<MaybeError<...>>`; keep using `success()` / `fail()` in the handler.

## General guidelines

Follow the root [AGENTS.md](../../AGENTS.md) skill index and [cf-starter-workflow](../../agents/skills/cf-starter-workflow/SKILL.md) for:
- Linting and completion checklist
- Environment variable management ([cf-workers-env-local](../../agents/skills/cf-workers-env-local/SKILL.md))
- Alchemy / worker package conventions ([cf-starter-gotchas](../../agents/skills/cf-starter-gotchas/SKILL.md) and the `cf-` skills linked there)
- **WebSocket / `/api/ws` / chat:** [cf-socka-realtime](../../agents/skills/cf-socka-realtime/SKILL.md) and [cf-realtime-websockets](../../agents/rules/cf-realtime-websockets.mdc) (Socka, SSR-safe URLs, `workers/app.ts` forwarding)
