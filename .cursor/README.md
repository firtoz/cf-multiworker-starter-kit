# Cursor configuration

Configuration that only **Cursor** consumes lives here, plus **symlinks** into the repo’s canonical AI layout.

## Canonical copy: `.agents/`

**Rules and skills are edited in [`.agents/`](../.agents/README.md)** only:

- [`.agents/rules/`](../.agents/rules/) — workspace rules (`.mdc` files; same files Cursor loads via the symlink below)
- [`.agents/skills/`](../.agents/skills/) — project skills (same)

In this checkout, **`.cursor/rules` → `../.agents/rules`** and **`.cursor/skills` → `../.agents/skills`**. If something recreated plain directories instead of links (e.g. a bad copy), run from the repo root: `bash .agents/install-symlinks.sh`.

**Git:** use `git add .agents/` for rule and skill file changes. Staging paths like `.cursor/rules/foo.mdc` can fail with *beyond a symbolic link*; see [`.agents/README.md`](../.agents/README.md).

## Cursor-specific files in `.cursor/`

- **`environment.json`** — [Cloud Agent](https://cursor.com/docs/cloud-agent) install hook (`install` → `bash ./.cursor/setup-agent.sh`)
- **`setup-agent.sh`** — Installs Bun and runs `bun install` at repo root

**Read first for cloud agents:** the mandatory rule in [`.agents/rules/00-cloud-agent-mandatory.mdc`](../.agents/rules/00-cloud-agent-mandatory.mdc) (also visible here as `rules/00-cloud-agent-mandatory.mdc` via the symlink). More: [`.agents/rules/cloud-agent-setup.mdc`](../.agents/rules/cloud-agent-setup.mdc).

## Adding skills

See [`.agents/skills/creating-skills/SKILL.md`](../.agents/skills/creating-skills/SKILL.md) — new skills go under **`.agents/skills/<name>/SKILL.md`**, not a duplicate under `.cursor` alone.
