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
echo "Creating local private workspace..."
mkdir -p private

echo ""
echo "Setup complete. Useful commands:"
echo "  npm run build"
echo "  npm test"
echo "  npm run auth"
echo "  npm run mcp"
