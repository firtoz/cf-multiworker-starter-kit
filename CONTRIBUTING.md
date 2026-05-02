# Contributing

Thanks for helping improve this starter. This file is **contribution process and PR checks** only.

**Setup, first-time Alchemy/Cloudflare, `bun run dev`, and deploy** live in the root **[README.md](README.md)**. **Web app routes and bindings** in **[apps/web/README.md](apps/web/README.md)**. **Index of rules and skills** in **[AGENTS.md](AGENTS.md)**. **Edits to rules and skills** go in **[`agents/`](agents/README.md)** only (canonical tree); [`.cursor/rules`](.cursor/rules) and [`.cursor/skills`](.cursor/skills) are symlinks. After an unusual clone, run `bash agents/install-symlinks.sh` from the repo root. **When committing rule/skill changes,** `git add agents/` (or paths under `agents/`). Do not `git add` individual files as `.cursor/rules/…` — Git can reject that as *beyond a symbolic link*; see the **Git** section in [`agents/README.md`](agents/README.md).

## Local setup (summary)

1. Install [Bun](https://bun.sh/) and clone the repo.
2. From the repo root: `bun install` then `bun run setup` / `bun run setup:local` (interactive variable browser in a TTY, or `-- --yes` / `CI=true` for auto-generated Alchemy + chatroom secrets only — see README).
3. Complete first-time Alchemy/Cloudflare steps from the README before relying on `bun run dev` or deploy.
4. **Bun version:** match repo **`packageManager`** in root [package.json](package.json) and [`.github/workflows/ci.yml`](.github/workflows/ci.yml) (CI is the source of truth for drift).

## Code quality (before a PR)

- **TypeScript:** strict, avoid `any`, prefer `satisfies` where it helps.
- **Lint/format:** [Biome](https://biomejs.dev/) — `bun run lint` (repo root; may rewrite; re-run as needed). Root README describes `check --write` behavior.
- **Generated artifacts:** Do not hand-author React Router `+types`, Drizzle SQL, Drizzle `meta/*.json`, Drizzle migration wrappers, lockfiles, or `.alchemy/` state. For schema changes, edit `packages/db/src/schema.ts` or a package-local `src/schema.ts`, run `bun run db:generate` or the package-local `db:generate`, then commit the generated output. CI runs `bun run check:drizzle-generated` to warn on migration-only diffs.
- **Commits:** Conventional style is fine (`feat:`, `fix:`, `docs:`, etc.).

## What to run before you open a PR

From the **repo root**:

```bash
bun run typecheck
bun run lint
bun run build
```

Optionally `bun run dev` to exercise the app locally.

## Adding a Durable Object or worker package

The generator and post-steps (root `dev` filter, web bindings, `turbo` destroy, `bun run typegen`) are documented in the README under **“Add New Durable Objects”** and **“After `turbo gen durable-object`”**, and in [agents/skills/cf-durable-object-package/SKILL.md](agents/skills/cf-durable-object-package/SKILL.md) / [agents/skills/cf-web-alchemy-bindings/SKILL.md](agents/skills/cf-web-alchemy-bindings/SKILL.md).

## Dependency changes

- Prefer `bun add` from the repo root; scope to one app with `--filter` or `--cwd` (see [cf-starter-workflow](agents/skills/cf-starter-workflow/SKILL.md)).
- `bun run outdated`, `bun run update:interactive`, and `bun pm audit` (or your registry workflow) when upgrading.
- **Forks** may add Renovate, Dependabot, or similar; the template does not require one.

## Deploy and destroy (contributors)

- **`bun run deploy:prod`** / **`deploy:staging`** / **`deploy:preview`** — Root Turbo runs the full **`deploy:*`** graph: **`packages/state-hub`** serializes shared [Cloudflare Alchemy state](https://alchemy.run/guides/cloudflare-state-store/) first (each deploy app lists **`state-hub`** as a **`devDependency`** so Turbo **`^deploy:*`** runs hub deploy before sibling deploys), then D1 (**`CF_STARTER_APPS.database`**), workers, web — **not** a web-only filter. **`packages/alchemy-utils/alchemy-cli.ts`** maps **`PRODUCT_PREFIX`** / **`CF_STARTER_APPS`** keys to **`alchemy deploy|destroy|dev --app …`**. **`STAGE`** comes from **`dotenv-cli -v`** (preview: CI **`STAGE=pr-<n>`**). **`alchemy.run.ts`** literals and workspace **`package.json#name`** still follow README “Code-first infra names”. Needs matching dotfiles and a stable **`ALCHEMY_PASSWORD`** for that stage.
- **`bun run github:sync:staging`** / **`github:sync:prod`** — Local/admin-only **`stacks/admin.ts`** with **`GITHUB_SYNC_SCOPE=secrets`**: upserts **`RepositoryEnvironment`**, then GitHub Environment **secrets** and **variables** from the stage dotfile. Optional: set **`GITHUB_SYNC_UPDATE_ENVIRONMENT_PROTECTION=true`** and the full **`GITHUB_ENV_*`** set (see **`stacks/github-repository-environment-from-env.ts`**) to apply deployment protection in the same run. Uses **`gh auth token`** / **`gh repo view`** by default. Do not run from normal CI/deploy.
- **`bun run github:env:staging`** / **`github:env:prod`** — Same **`stacks/admin.ts`** with **`GITHUB_SYNC_SCOPE=environment`**: **only** **`RepositoryEnvironment`** (no dotfile, no secrets, no variables). Requires **`GITHUB_SYNC_ENVIRONMENT_ONLY_CONFIRM=true`** and every **`GITHUB_ENV_*`** key.
- **`bun run destroy:prod`** / **`destroy:staging`** / **`destroy:preview`** — Matching Turbo **`destroy:*`** graphs; order follows package config (web before dependents where set).

## Pull requests

1. Branch off `main` (e.g. `feat/…`, `fix/…`, `docs/…`).
2. Make changes; keep the diff focused.
3. Run typecheck, lint, and build (above).
4. Push and open a PR; wait for CI.

## Questions

- [Issues](https://github.com/firtoz/cf-multiworker-starter-kit/issues) and [README](README.md).

## License

By contributing, you agree your contributions are licensed under the [MIT License](README.md#license) used by this project.
