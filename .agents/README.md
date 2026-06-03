# AI agent rules and skills (canonical)

**This directory is the source of truth** for project-specific **rules** (`.agents/rules/`) and **skills** (`.agents/skills/`). Edit files here only—do not maintain a second copy under tool-specific folders.

## Layout

| Path | Role |
| --- | --- |
| `.agents/rules/*.mdc` | Workspace rules (Cursor `*.mdc` with optional YAML frontmatter) |
| `.agents/skills/<name>/SKILL.md` | Agent skills (per [Agent Skills](https://agentskills.io) conventions) |
| [`.cursor/`](../.cursor/) | **Cursor** — `rules` and `skills` are **symlinks** to `../.agents/rules` and `../.agents/skills`. Cursor-only files stay here: `environment.json`, `setup-agent.sh` |

[Cursor](https://cursor.com) reads project rules from `.cursor/rules/`. The symlink keeps Cursor and this repo’s canonical tree aligned, similar in spirit to [sharing rules via symlinks](https://www.rushis.com/sharing-ai-agent-configs-between-cursor-and-claude-with-symlinks/) (central folder + links per tool).

## Other tools (Claude Code, Codex, …)

This repo does not assume every tool uses the same paths. After clone (or if symlinks are missing), run from the **repository root**:

```bash
bun run agents:link
# or: bash .agents/install-symlinks.sh
# optional Claude Code symlinks: bun run agents:link -- --claude
```

That script creates or refreshes:

- **Cursor:** `.cursor/rules` → `.agents/rules`, `.cursor/skills` → `.agents/skills` (if not already present as symlinks)
- **Claude Code** (optional): `.claude/rules` and `.claude/skills` → same targets (`--claude` creates `.claude/` if needed)

The script is idempotent: existing **correct** symlinks are left alone; a real file or directory at the same path is skipped with a warning so you do not get overwritten by mistake.

## Git: stage `.agents/`, not paths under the symlinks

Because `.cursor/rules` and `.cursor/skills` are **symlinks**, Git may error with *`pathspec '…' is beyond a symbolic link`* if you run `git add` on a **file path** under them (e.g. `.cursor/rules/foo.mdc`).

**Do this instead:**

```bash
git add .agents/
# Cursor-only real files, if changed:
git add .cursor/README.md .cursor/setup-agent.sh .cursor/environment.json
# Symlink lines themselves, when you first add them or they change:
git add .cursor/rules .cursor/skills
git add .claude/rules .claude/skills   # if you use Claude and track these
```

Do **not** list individual files as `.cursor/rules/…` or `.cursor/skills/…` in `git add`.

## Index for humans and agents

Start at the repo root **[AGENTS.md](../AGENTS.md)** for a short table of skills and always-on rules.
