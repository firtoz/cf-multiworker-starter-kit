#!/usr/bin/env bash
# Link tool-specific layout to canonical .agents/ rules and skills.
# Run from repo root: bash .agents/install-symlinks.sh
# See .agents/README.md

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RULES="${ROOT}/.agents/rules"
SKILLS="${ROOT}/.agents/skills"
TARGETS=()

# Cursor: .cursor/ must exist (has environment.json, setup-agent.sh)
if [[ -d "${ROOT}/.cursor" ]]; then
	TARGETS+=("${ROOT}/.cursor")
else
	echo "Note: ${ROOT}/.cursor not found; skipping Cursor symlinks" >&2
fi

# Claude Code: optional, only if you use it
if [[ -d "${ROOT}/.claude" ]] || [[ "${1:-}" == "--claude" ]]; then
	mkdir -p "${ROOT}/.claude"
	TARGETS+=("${ROOT}/.claude")
fi

if [[ ${#TARGETS[@]} -eq 0 ]]; then
	echo "No target directories. Create .claude/ or pass --claude to create it, or use this repo in place with an existing .cursor/." >&2
	exit 0
fi

if [[ ! -d "${RULES}" ]] || [[ ! -d "${SKILLS}" ]]; then
	echo "Missing ${RULES} or ${SKILLS} — nothing to link." >&2
	exit 1
fi

link_into() {
	local base="$1"
	local name="$2" # rules | skills
	local src="${ROOT}/.agents/${name}"
	local dest="${base}/${name}"

	if [[ -L "${dest}" ]]; then
		local cur
		cur="$(readlink -f "${dest}" 2>/dev/null || readlink "${dest}" 2>/dev/null || true)"
		if [[ "${cur}" == "${src}" ]] || [[ "${cur}" == "${src}/" ]]; then
			echo "  ok ${dest} (already -> ${src})"
			return 0
		fi
		echo "  ⚠ ${dest} is a different symlink; remove it manually, then re-run" >&2
		return 0
	fi
	if [[ -e "${dest}" ]]; then
		echo "  ⚠ ${dest} exists and is not a symlink; skip (move or delete to use symlink)" >&2
		return 0
	fi
	# Relative: from e.g. .cursor/rules -> ../.agents/rules
	ln -s "../.agents/${name}" "${dest}"
	echo "  + ${dest} -> ../.agents/${name}"
}

for t in "${TARGETS[@]}"; do
	echo "→ ${t}"
	link_into "${t}" "rules"
	link_into "${t}" "skills"
done
echo "Done."
