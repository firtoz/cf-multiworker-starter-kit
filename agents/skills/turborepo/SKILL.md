---
name: turborepo
description: Turborepo task configuration patterns for monorepo management. Use when configuring turbo.json tasks, setting up task dependencies, managing cache inputs/outputs, or working with cross-package dependencies in the monorepo.
---

# Turborepo Task Configuration

Patterns and best practices for configuring Turborepo tasks and dependencies in this monorepo.

## When to Use This Skill

Use when:
- Adding new tasks to `turbo.json` files
- Configuring task dependencies between packages
- Setting up inputs/outputs for caching
- Creating cross-package dependencies
- Optimizing turbo cache configuration

## Running Turbo Commands

**Run repo-root scripts from the workspace root** (e.g. `bun run typecheck`, `bun run build`, `bun run lint`, `bun run dev` defined in the root [package.json](../../../package.json)) so Turbo orchestrates the graph.

```bash
# From repo root — Turbo picks packages, order, and cache
bun run typecheck
bun run build

# Avoid: cd apps/web && bun run typecheck — bypasses the monorepo task graph
```

**Telemetry:** GitHub Actions workflows set **`TURBO_TELEMETRY_DISABLED=1`** so Turborepo skips telemetry prompts/network work in CI ([docs](https://turborepo.dev/docs/telemetry)). Locally, run **`turbo telemetry disable`** once or **`export TURBO_TELEMETRY_DISABLED=1`** before **`bun run …`**.

**Root `bun run dev`** is intentionally **filtered** (`--filter=@internal/web` and each worker package) so only real Alchemy apps start. You don’t pass `--filter` for every *task*—only this **dev** script is narrowed to specific apps. Other root scripts (typecheck, build, lint) use Turbo’s default package scope.

Turbo: resolves package order, parallelizes, caches. **Turbo `inputs`** (per-package) are not the same as **TypeScript `include`** in a `tsconfig`—see [@internal/web `turbo.json`](../../../apps/web/turbo.json) vs [tsconfig.cloudflare.json](../../../apps/web/tsconfig.cloudflare.json).

## Core Principles

### `@internal/web` — package-local `inputs`, `^` for cross-package work

**Rule:** Each package’s `turbo.json` **`inputs`** should list **only files inside that package** (plus shared root env / `tsconfig.base.json` when your `tsconfig` extends it). **Do not** add `$TURBO_ROOT$/packages/foo/**` or `../../durable-objects/**` to **`apps/web`** to fake cache invalidation.

**How invalidation should work:** list other workspace packages in **`package.json`** `dependencies` / `devDependencies`. Use **`^task`** so Turbo runs the same task in all those packages; when a dependency’s **outputs** or **input hash** change, **dependents re-run** without listing foreign paths.

**`@internal/web#typegen`:** `dependsOn` is **`^typegen`**, **`^db:generate`** (D1 migrations ahead of app codegen). The package script runs **`react-router typegen`** (see **`bun run rr-typegen`**). Upstream packages (**`@internal/db`**, **`@internal/chat-contract`**, workers) finish their own **`typegen`** (stub or no-op) **before** dependents; **`typecheck`** always runs **after** workspace **`typegen`** where the graph says so.

**`@internal/web#typecheck`:** `dependsOn` **`typegen`**, then **`^typecheck`**, so the app typechecks after `.react-router/types` exist and workspace deps have typechecked.

**Durable Object packages (e.g. `chatroom-do`):** do **not** set **`typegen`** to depend on **`^typecheck`** (cycle risk). Use **`^typegen`** for upstreams (e.g. **`@internal/chat-contract`**) instead.

**D1 / migrations:** **`packages/db/alchemy.run.ts`** defines **`D1Database`** (**alchemy app **`starter-database`**, npm workspace **`@internal/db`**). The web app imports **`mainDb`** from **`@internal/db/alchemy`**. D1 migrations are applied by Alchemy from **`migrationsDir`** during **`dev`** / **`deploy:*`**; do not add separate Wrangler migration scripts.

**Package Alchemy apps:** Each deployable package owns **`alchemy.run.ts`**, declares **`alchemy.app`** in **`package.json`**, and **`dev` / `deploy:*` / `destroy:*`** run **`alchemy-cli --stage local|staging|prod|preview …`** (**`alchemy dev|deploy|destroy --app …`** internally; **`STAGE`** from **`--stage`** or CI — see [Alchemy Turborepo](https://alchemy.run/guides/turborepo/)). Root **`bun run dev`** filters Turbo to web + **`@internal/db`** + worker apps. **`deploy:*`** uses **`cache: false`** so Turbo always runs Alchemy deploy; **`destroy:*`** is also **`cache: false`**.

### 1. Task Dependencies Should Use Outputs, Not Inputs

**Bad:**
```json
// apps/web/turbo.json
"typegen": {
  "inputs": [
    "$TURBO_ROOT$/packages/some-tool/src/generator.ts"  // ❌ Direct file reference
  ]
}
```

**Good:**
```json
// apps/web/turbo.json
"typegen": {
  "dependsOn": ["my-tool#build", "^typegen", "^db:generate"],
  "inputs": [
    "app/routes.ts",
    "react-router.config.ts"
  ]
}
```

**Why:** If task B depends on task A, B should depend on A's outputs (or **`package#task`**), not A's source paths as loose **`inputs`**. Turbo handles the transitive dependency chain automatically.

### 2. Cross-Package Dependencies via `package#task`

When a package needs files from another package to be ready:

**Step 1:** Source package defines a `build` task
```json
// packages/my-tool/package.json
{
  "scripts": {
    "build": "echo '✓ my-tool ready'"  // Can be a no-op
  }
}

// packages/my-tool/turbo.json
{
  "tasks": {
    "build": {
      "inputs": ["src/**/*.ts", "package.json"],
      "outputs": []
    }
  }
}
```

**Step 2:** Consumer package depends on `package#build`
```json
// apps/web/turbo.json
{
  "tasks": {
    "typegen": {
      "dependsOn": ["my-tool#build", "^typegen", "^db:generate"]
    }
  }
}
```

**Never do:**
```json
// ❌ DON'T reference other package's files directly
"inputs": ["$TURBO_ROOT$/packages/scripts/src/utils/file.ts"]
```

### 2b. `^task` — run a task in all workspace dependencies

Prefix a task with `^` to depend on the **same task name** in every package listed in this package’s `package.json` **`dependencies` and `devDependencies`** (workspace graph). Avoids repeating `peer-a#task`, `peer-b#task` in `turbo.json`.

**Example — `apps/web` lists Durable Object packages so Turbo can fan out:**

```json
// apps/web/package.json
{
  "dependencies": {
    "@internal/db": "workspace:*",
    "@internal/chat-contract": "workspace:*",
    "chatroom-do": "workspace:*"
  }
}
```

```json
// apps/web/turbo.json
"typegen": {
  "dependsOn": ["^typegen", "^db:generate"]
}
```

This runs **`typegen`** in `chatroom-do`, `@internal/db`, and other workspace deps **before** the web package’s **`typegen`** (React Router codegen). **`^db:generate`** pulls **`@internal/db#db:generate`** when migrations affect consumers. Deploy is stage-specific at the root — e.g. **`bun run deploy:prod`** runs **`turbo run deploy:prod`**, which runs **`^deploy:prod`** (including **`@internal/db#deploy:prod`**) before the web **`alchemy deploy`** for that stage.

**Limits:** `^` only follows **declared** workspace deps. Packages that are not dependencies (e.g. sibling workers with only Wrangler `script_name` links) still need explicit `other-pkg#task` in their own `turbo.json`. Verify with:

`bunx turbo run <task> --filter=<pkg> --dry-run=json`

### 3. Task Definition Hierarchy

Tasks are defined in three places:

1. **Root `turbo.json`** - Global defaults and settings
   - Global outputLogs settings
   - Global env vars
   - Base task defaults

2. **Package `turbo.json`** - Package-specific tasks
   - Task-specific inputs/outputs
   - Task dependencies
   - Package-local configurations

3. **Package `package.json`** - Actual scripts
   - Must exist for turbo to run the task
   - Can be a simple echo for meta-tasks

### 4. Inputs and Outputs

**Inputs** - Files that affect the task output:
```json
"inputs": [
  "src/**/*.ts",           // Source files
  "package.json",          // Dependencies
  "tsconfig.json",         // Configuration
  "$TURBO_ROOT$/.env.local" // Root-level files (use sparingly)
]
```

**Outputs** - Files generated by the task:
```json
"outputs": [
  "dist/**/*",        // Build artifacts
  "*.d.ts",           // Type definitions
  ".next/**",         // Framework outputs
  "!.next/cache/**"   // Exclude from outputs
]
```

**Rules:**
- Only include files that actually affect the task
- Use globs for efficiency
- Outputs enable cache restoration
- Empty outputs `[]` means task always runs (but can still cache based on inputs)

## Common Patterns

### Pattern 1: Code Generation Task

```json
// Task that generates code from a template
"generate-config": {
  "dependsOn": ["scripts#build"],           // Wait for scripts to be ready
  "inputs": [
    "config.template.json",                 // Template file
    "$TURBO_ROOT$/.env.local"               // Environment variables
  ],
  "outputs": ["config.json"]                // Generated file
}
```

### Pattern 2: Type Generation from Generated Files

```json
// Task that depends on generated files
"typegen": {
  "dependsOn": ["generate-config"],         // Wait for config generation
  "inputs": [
    "src/**/*.ts",                          // Source files
    "config.json"                           // Generated config (from previous task)
  ],
  "outputs": ["types/**/*.d.ts"]
}
```

### Pattern 3: Build Task with External Dependencies

```json
"build": {
  "dependsOn": ["^build", "typegen"],       // ^build = dependencies' build first
  "inputs": [
    "src/**/*",
    "public/**/*",
    "package.json",
    "tsconfig.json"
  ],
  "outputs": ["dist/**/*", ".next/**", "!.next/cache/**"]
}
```

### Pattern 4: No-op Meta Task

```json
// package.json
{
  "scripts": {
    "build": "echo '✓ Package ready'"       // Simple marker
  }
}

// turbo.json
{
  "tasks": {
    "build": {
      "inputs": ["src/**/*.ts"],            // Files that must be ready
      "outputs": []                         // No actual build output
    }
  }
}
```

## Environment Variables

### Global Env (available to all tasks)
```json
// Root turbo.json
{
  "globalEnv": [
    "NODE_ENV",
    "CLOUDFLARE_API_TOKEN"
  ]
}
```

### Task-specific Env
```json
// Package turbo.json
{
  "tasks": {
    "deploy": {
      "env": ["DEPLOY_ENV", "API_TOKEN"],
      "cache": false  // Don't cache tasks with secrets
    }
  }
}
```

## Caching Strategy

### Cache Everything Possible
```json
"build": {
  "inputs": ["src/**/*"],
  "outputs": ["dist/**"]
  // cache: true is default
}
```

### What stays uncached
**`dev`** (persistent) and **`clean`** and **`destroy:*`** (destructive) use **`cache: false`** in this repo. **`deploy:*`** (Alchemy) also. Run **`turbo run <task> --force`** to bypass cache when other tasks look stale.

```json
"dev": {
  "cache": false,
  "persistent": true
},
"clean": {
  "cache": false
}
```

## Task Dependency Patterns

### Sequential Dependencies
```json
"task-c": {
  "dependsOn": ["task-a", "task-b"]  // Both must complete first
}
```

### Topological Dependencies (workspace dependencies)
```json
"build": {
  "dependsOn": ["^build"]  // Build all workspace dependencies first
}
```

### Mixed Dependencies
```json
"build:prod": {
  "dependsOn": [
    "^build",       // Dependencies' build
    "typecheck" // Own gate before Vite production build
  ]
}
```

## Common Mistakes

### This repo — project-specific pitfalls

The same gotchas (index route + forms, `formSchema`, Alchemy D1, stale `typegen` → **`bun run typegen -- --force`**, local D1 until `bun run dev`, Biome, dev port) are in [multiworker-gotchas](../multiworker-gotchas/SKILL.md). For **Turbo-only** rules (package-local `inputs`, **`^typegen`** / **`^db:generate`** on web **`typegen`**, never **`^typecheck`** on **`typegen`**, no `^typecheck` on DO `typegen` to avoid cycles), see **Core principles** at the top of this file.

### ❌ Don't: Reference Other Package's Files Directly
```json
"inputs": ["$TURBO_ROOT$/packages/utils/src/helper.ts"]
```

### ✅ Do: Depend on Other Package's Build Task
```json
"dependsOn": ["utils#build"]
```

### ❌ Don't: Include All Files in Inputs
```json
"inputs": ["**/*"]  // Too broad, slows down hashing
```

### ✅ Do: Be Specific with Inputs
```json
"inputs": ["src/**/*.ts", "package.json", "tsconfig.json"]
```

### ❌ Don't: Forget to Define Outputs
```json
"build": {
  "inputs": ["src/**/*"]
  // Missing outputs - turbo can't restore from cache
}
```

### ✅ Do: Always Define Outputs for Cacheable Tasks
```json
"build": {
  "inputs": ["src/**/*"],
  "outputs": ["dist/**"]
}
```

## Debugging

### Check Task Graph
```bash
bun run build --graph
bun run build --dry-run
```

### Inspect Cache
```bash
bun run build --summarize
```

### Force No Cache
```bash
bun run build --force
```

### Verbose Output
```bash
bun run build --verbose
```

## This Project's Structure

### Root turbo.json
- Global settings: `globalDependencies`, `ui`, task defaults
- Tasks: `build`, `build:local`, `build:prod`, `typecheck`, `typegen`, `dev`, `lint`, `clean`, `db:generate`, `deploy:*`, `destroy:*` (output log defaults)

- `globalEnv`: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CI`, `ALCHEMY_PASSWORD`, `ALCHEMY_STATE_TOKEN`, `CHATROOM_INTERNAL_SECRET`, `STAGE`, `DEPLOY_ENABLED`

### apps/web/turbo.json
- **`typegen`** — `dependsOn`: **`^typegen`**, **`^db:generate`**; **outputs** **`.react-router/**`**; package script runs **`react-router typegen`** (**`bun run rr-typegen`**)
- **`typecheck`** — `dependsOn`: this package’s **`typegen`**, then **`^typecheck`**
- **`lint`** — `dependsOn`: **`typecheck`**
- **`build:local` / `build:prod` / `build:staging`** — `dependsOn`: **`typecheck`**
- **`deploy:*`** — `dependsOn`: **`typecheck`** plus **`^deploy:*`**; do **not** depend on `build:*` because Alchemy **`ReactRouter`** builds during deploy.
- **`dev`** — `dependsOn`: **`typegen`**; root **`bun run dev`** runs a **filtered** Turbo **`dev`** (web + **`@internal/db`** + worker apps) so each runs **`alchemy-cli --stage local dev`**

### packages/db/turbo.json
- `db:generate` — Drizzle SQL from `src/`
- `dev` / `deploy:*` / `destroy:*` — **`alchemy-cli --stage …`** with **`package.json` → `alchemy.app`** + **`ALCHEMY_APP_IDS.database`** (**`deploy database`**, **`dev database`**, …; see **`package.json`** scripts)
- `typegen` — Turbo **`dependsOn`** includes **`db:generate`** upstream so migrations exist before dependents; **`package.json`** script is a stub (`node -e "process.exit(0)"`).
- `typecheck` — `tsgo --noEmit` for `@internal/db`

### Durable objects (e.g. `chatroom-do`)
- `turbo.json` with `typegen` / `typecheck` / `lint` / **`deploy:*`** / **`destroy:*`** (**`package.json`** uses **`alchemy-cli`** for **`dev`/`deploy`/`destroy`**); list **`state-hub`** as a **`devDependency`** so **`dependsOn`** **`^deploy:*`** runs the hub deploy first; no **`generate-wrangler`**

### Key Dependency Chains (simplified)

```
^typegen + ^db:generate → @internal/web#typegen (react-router typegen script)
@internal/web#typecheck → typegen, ^typecheck
lint / build → typecheck
dev → filtered turbo runs `alchemy-cli --stage local dev` for web + each worker package
```

## Resources

- [Turborepo Documentation](https://turbo.build/repo/docs)
- [Task Dependencies](https://turbo.build/repo/docs/core-concepts/monorepos/running-tasks)
- [Caching](https://turbo.build/repo/docs/core-concepts/caching)
- [Configuration](https://turbo.build/repo/docs/reference/configuration)
