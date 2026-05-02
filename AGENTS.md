# Agent instructions

Short index for AI agents. **Details live in skills** under **[`agents/skills/`](agents/skills/)** (project-specific playbooks for this monorepo, not generic marketing). **Source of truth:** add or change only files in **`agents/rules/`** and **`agents/skills/`**; [`.cursor/rules`](.cursor/rules) and [`.cursor/skills`](.cursor/skills) are symlinks for Cursor. See [`agents/README.md`](agents/README.md). Run `bash agents/install-symlinks.sh` from the repo root if symlinks are missing after a clone.

## Read first (by task)

| Topic | Where |
| -------- | ------ |
| Fork gotchas, forms, D1, dev port, new DO packages | [agents/skills/cf-starter-gotchas/SKILL.md](agents/skills/cf-starter-gotchas/SKILL.md) |
| Root commands, typegen/lint cadence, deploy, checklist, `bun add` | [agents/skills/cf-starter-workflow/SKILL.md](agents/skills/cf-starter-workflow/SKILL.md) |
| Env files, `.env.local` / `.env.production`, secrets | [agents/skills/cf-workers-env-local/SKILL.md](agents/skills/cf-workers-env-local/SKILL.md) |
| Turbo tasks, `^`, cache, `inputs` | [agents/skills/turborepo/SKILL.md](agents/skills/turborepo/SKILL.md) |
| Web ↔ worker bindings, `apps/web/alchemy.run.ts` | [agents/skills/cf-web-alchemy-bindings/SKILL.md](agents/skills/cf-web-alchemy-bindings/SKILL.md) |
| Durable Object package layout, Hono, `workers/rpc` | [agents/skills/cf-durable-object-package/SKILL.md](agents/skills/cf-durable-object-package/SKILL.md) |
| Socka WebSockets, DO realtime, SSR-safe `wss://`, whiteboard/canvas patterns | [agents/skills/cf-socka-realtime/SKILL.md](agents/skills/cf-socka-realtime/SKILL.md) |
| `WorkerRef`, cross-worker types, root `dev`/`destroy` | [agents/skills/cf-worker-rpc-turbo/SKILL.md](agents/skills/cf-worker-rpc-turbo/SKILL.md) |
| React Router routes, `RoutePath`, loaders | [agents/skills/routing/SKILL.md](agents/skills/routing/SKILL.md) |
| `formAction`, `useDynamicSubmitter` | [agents/skills/form-submissions/SKILL.md](agents/skills/form-submissions/SKILL.md) |
| Rename / rebrand after using the template | [agents/skills/project-init/SKILL.md](agents/skills/project-init/SKILL.md) |
| React components: one per file, route wrappers | [agents/skills/component-organization/SKILL.md](agents/skills/component-organization/SKILL.md) |
| React patterns (callbacks, module constants) | [agents/skills/react-patterns/SKILL.md](agents/skills/react-patterns/SKILL.md) |
| Authoring or updating skills | [agents/skills/creating-skills/SKILL.md](agents/skills/creating-skills/SKILL.md) |

**Always-on reminder (workers, env, routes):** [agents/rules/cf-workers-patterns.mdc](agents/rules/cf-workers-patterns.mdc)

**Generated artifacts policy:** [agents/rules/generated-artifacts.mdc](agents/rules/generated-artifacts.mdc). Never hand-author Drizzle migration SQL, Drizzle `meta/*.json`, React Router `+types`, lockfiles, or `.alchemy/` output. Edit the source of truth and run the generator.

**When to offer project-init** (forks vs upstream starter kit): [agents/rules/project-init.mdc](agents/rules/project-init.mdc)

**Dev server policy (agents):** do not start long-running dev unless the user asked — [agents/rules/dev-server.mdc](agents/rules/dev-server.mdc)

## Cloud agents

**Mandatory setup:** [agents/rules/00-cloud-agent-mandatory.mdc](agents/rules/00-cloud-agent-mandatory.mdc)

If `bun` is missing in the agent environment:

```bash
cd /workspace && bash ./.cursor/setup-agent.sh && source ~/.bashrc
```

Setup is normally applied via `.cursor/environment.json`.

## One-liner defaults

- Bindings in app code: `import { env } from "cloudflare:workers"` (not React Router `context.cloudflare.env`).
- Drizzle migrations: edit `packages/db/src/schema.ts` or `durable-objects/<name>/src/schema.ts`, then run `bun run db:generate` or the package-local `db:generate`. Use the correct Drizzle driver (`d1-http` for D1, `durable-sqlite` for DO SQLite). Do not write SQL/meta snapshots or migration wrappers by hand.
- Maintenance loop: run the narrowest useful check frequently (`bun run typegen` after routes/env/Alchemy, `bun run typecheck` after TypeScript/API edits, `bun run lint` before finishing) from the **repo root**. Full checklist: [cf-starter-workflow](agents/skills/cf-starter-workflow/SKILL.md).
- Alchemy infra naming: literals in **`alchemy.run.ts`** (**`await alchemy`**) and **[`packages/alchemy-utils/src/worker-peer-scripts.ts`](packages/alchemy-utils/src/worker-peer-scripts.ts)** — no env-var branding. README explains **`--filter`** vs **`--app`**.

## Creating new skills

When a pattern repeats or `AGENTS.md` would grow again, add a skill: [agents/skills/creating-skills/SKILL.md](agents/skills/creating-skills/SKILL.md). **Keep each skill scoped to one kind of task**; if `SKILL.md` blows past ~350 lines or mixes unrelated workflows, split or move depth to `references/` (heuristic in that doc).
