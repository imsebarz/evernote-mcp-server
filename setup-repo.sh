#!/usr/bin/env bash
# Local setup helper for evernote-mcp-server.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "Setting up evernote-mcp-server..."

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is required. Install Node.js before running this script." >&2
  exit 1
fi

echo ""
echo "Installing npm dependencies..."
npm install

echo ""
if ! command -v git >/dev/null 2>&1; then
  echo "Skipping private submodule setup because git is not installed."
elif git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Initializing private submodule..."
  git submodule sync --recursive

  if git submodule update --init --recursive private; then
    echo "Private submodule is ready at private/."
  else
    echo "Warning: private submodule could not be initialized."
    echo "This is expected for users without access to jonmlevine/evernote-mcp-private."
    echo "Authorized users can run:"
    echo "  gh auth login"
    echo "  git submodule update --init --recursive private"
  fi
else
  echo "Skipping private submodule setup because this directory is not a git checkout."
fi

echo ""
if [ -f "private/SCANSNAP_CLASSIFICATION_PATTERNS.md" ]; then
  echo "Private ScanSnap classification patterns found."
else
  echo "Private ScanSnap data is not available in this checkout."
  echo "The core Evernote MCP server can still be built and run."
fi

echo ""
echo "Setup complete. Useful commands:"
echo "  npm run build"
echo "  npm test"
echo "  npm run auth"
echo "  npm run mcp"
