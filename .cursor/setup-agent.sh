#!/bin/bash
# Setup script for Cursor Cloud Agents
# This ensures bun and project dependencies are available

set -e

echo "🚀 Cursor Cloud Agent Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Ensure we're in the workspace root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ "$PWD" != "$WORKSPACE_ROOT" ]; then
    echo "⚠️  Not in workspace root. Changing to: $WORKSPACE_ROOT"
    cd "$WORKSPACE_ROOT"
fi

echo "📍 Working directory: $PWD"
echo ""

export PATH="$HOME/.bun/bin:$PATH"

# Keep agent setup aligned with the runtime pin used by CI.
PINNED_BUN_VERSION="$(grep -oE '"packageManager"[[:space:]]*:[[:space:]]*"bun@[0-9.]+"' package.json | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || true)"
if [ -z "$PINNED_BUN_VERSION" ]; then
    echo "❌ package.json must declare a numeric bun@ version."
    exit 1
fi

if ! command -v bun &> /dev/null || [ "$(bun --version)" != "$PINNED_BUN_VERSION" ]; then
    echo "📦 Installing Bun $PINNED_BUN_VERSION from packageManager..."
    curl -fsSL https://bun.sh/install | bash -s -- "bun-v$PINNED_BUN_VERSION"
    export PATH="$HOME/.bun/bin:$PATH"
fi

if [ "$(bun --version)" != "$PINNED_BUN_VERSION" ]; then
    echo "❌ Bun does not match the packageManager pin."
    exit 1
fi
echo "✅ Bun ready: $(bun --version)"

# Ensure bun is in PATH for this session
export PATH="$HOME/.bun/bin:$PATH"

# Match the Node tooling runtime selected by CI and .nvmrc.
PINNED_NODE_VERSION="$(tr -d '[:space:]' < .nvmrc)"
if [[ ! "$PINNED_NODE_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Invalid Node version in .nvmrc" >&2
    exit 1
fi
if [ "$(node --version 2>/dev/null || true)" != "v$PINNED_NODE_VERSION" ]; then
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    if [ ! -s "$NVM_DIR/nvm.sh" ]; then
        echo "Node $PINNED_NODE_VERSION is required; install nvm or activate that Node version and rerun setup." >&2
        exit 1
    fi
    # shellcheck disable=SC1091
    . "$NVM_DIR/nvm.sh"
    nvm install "$PINNED_NODE_VERSION"
    nvm use "$PINNED_NODE_VERSION"
    nvm alias default "$PINNED_NODE_VERSION" >/dev/null
fi
if [ "$(node --version)" != "v$PINNED_NODE_VERSION" ]; then
    echo "Node activation did not select the pinned runtime" >&2
    exit 1
fi
# Resolve sources before linking so reruns cannot create self-referential shims.
mkdir -p "$HOME/.bun/bin"
for tool in node npm npx; do
    source_path="$(command -v "$tool" || true)"
    if [ -n "$source_path" ]; then
        source_path="$(readlink -f "$source_path")"
        if [ "$source_path" != "$HOME/.bun/bin/$tool" ]; then
            ln -sfn "$source_path" "$HOME/.bun/bin/$tool"
        fi
    fi
done

# Install project dependencies
echo ""
echo "📦 Installing project dependencies..."
if [ ! -d "node_modules" ]; then
    bun install --frozen-lockfile
    echo "✅ All dependencies installed"
else
    echo "✅ Dependencies already present"
    # Still run install to ensure lockfile is respected
    bun install --frozen-lockfile
fi

# Seed .env.local (same as contributors' `bun run setup -- --yes`).
echo ""
echo "🔐 Ensuring repo-root .env.local (non-interactive seed)…"
if ! bun run setup -- --yes; then
	echo "⚠️  setup-env failed (read-only disk, permissions, or I/O). Set ALCHEMY_PASSWORD and CHATROOM_INTERNAL_SECRET in .env.local yourself, or: bun run setup"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ Environment setup complete!"
echo ""
echo "⚡ Quick Start:"
echo "   source ~/.bashrc                    # Load bun into current shell"
echo "   bun --version                       # Verify bun works"
echo ""
echo "📝 Common Commands (turbo handles everything):"
echo "   bun run build                       # Build all packages"
echo "   bun run typecheck                   # Type check all packages"
echo "   bun run lint                        # Lint all packages"
echo ""
echo "🔍 If you encounter issues:"
echo "   1. Check you're in /workspace: pwd"
echo "   2. Source bashrc: source ~/.bashrc"
echo "   3. Verify bun: which bun && bun --version"
echo ""
echo "📚 See .agents/rules/00-cloud-agent-mandatory.mdc for full guide"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
