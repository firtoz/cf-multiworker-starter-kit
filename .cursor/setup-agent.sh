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

# Install bun if not available
if ! command -v bun &> /dev/null; then
    echo "📦 Installing bun..."
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
    
    # Source bashrc to ensure bun is available
    if [ -f "$HOME/.bashrc" ]; then
        source "$HOME/.bashrc"
    fi
    
    echo "✅ Bun installed: $(bun --version)"
else
    echo "✅ Bun already installed: $(bun --version)"
fi

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
echo "📚 See agents/rules/00-cloud-agent-mandatory.mdc for full guide"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
