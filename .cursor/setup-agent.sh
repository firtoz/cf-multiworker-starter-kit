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
