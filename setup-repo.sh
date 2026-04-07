#!/bin/bash
# Quick setup: init git, commit, and push to GitHub
# Run this from the evernote-api folder on your machine

set -e

echo "Setting up evernote-mcp-server repo..."

# Remove old .git if it exists (leftover from sandbox)
rm -rf .git

git init
git branch -M main
git add .gitignore README.md package.json package-lock.json tsconfig.json mcp.json src/
git commit -m "Initial release: Evernote MCP Server v2.0.0

Reverse-engineered unofficial Evernote API client with:
- OAuth2 PKCE authentication (same flow as official web client)
- Full REST API client with 30+ methods
- 22 MCP tools for Claude Desktop/Code integration
- Semantic search, AI summarize/rephrase/suggest, rich links
- ENML helpers (text, markdown, checklist to ENML)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"

git remote add origin git@github.com:imsebarz/evernote-mcp-server.git
git push -u origin main

echo ""
echo "Done! Repo live at https://github.com/imsebarz/evernote-mcp-server"
