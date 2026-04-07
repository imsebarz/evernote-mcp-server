#!/usr/bin/env node
// ============================================================
// Standalone auth script for MCP server setup.
// Run this ONCE before starting the MCP server.
//
// Usage: npx tsx src/mcp-auth.ts
// ============================================================

import { authenticate } from "./auth.js";

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  Evernote MCP Server — Authentication Setup     ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  try {
    const tokens = await authenticate({ port: 10500 });

    console.log("\n╔══════════════════════════════════════════════════╗");
    console.log("║  ✓ Authentication successful!                   ║");
    console.log("╠══════════════════════════════════════════════════╣");
    console.log(`║  User ID:  ${tokens.userId.padEnd(37)}║`);
    console.log(`║  Shard:    ${tokens.shard.padEnd(37)}║`);
    console.log(`║  Expires:  ${new Date(tokens.expiresAt).toISOString().padEnd(37)}║`);
    console.log("╠══════════════════════════════════════════════════╣");
    console.log("║  Tokens saved to ~/.evernote-api/tokens.json    ║");
    console.log("║                                                 ║");
    console.log("║  You can now start the MCP server:              ║");
    console.log("║    npx tsx src/mcp-server.ts                    ║");
    console.log("║                                                 ║");
    console.log("║  Or add to Claude Desktop config:               ║");
    console.log('║    See README.md "Claude Desktop" section       ║');
    console.log("╚══════════════════════════════════════════════════╝\n");
  } catch (error) {
    console.error("\n✗ Authentication failed:", error);
    process.exit(1);
  }
}

main();
