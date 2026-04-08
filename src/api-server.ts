#!/usr/bin/env node
// ============================================================
// Evernote REST API Server
// HTTP endpoints for notes, notebooks, and tags.
// ============================================================

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { EvernoteClient } from "./client.js";
import { loadTokens, refreshTokens, saveTokens } from "./auth.js";
import type { AuthTokens } from "./types.js";

const PORT = parseInt(process.env.PORT || "3000", 10);

function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

async function handleRequest(client: EvernoteClient, req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/api/notes") {
    const result = await client.listNotes();
    if (!result.ok) return json(res, 502, { error: result.error });
    return json(res, 200, { notes: result.data });
  }

  if (req.method === "GET" && url.pathname === "/api/notebooks") {
    const result = await client.listNotebooks();
    if (!result.ok) return json(res, 502, { error: result.error });
    return json(res, 200, { notebooks: result.data });
  }

  if (req.method === "GET" && url.pathname === "/api/tags") {
    const result = await client.listTags();
    if (!result.ok) return json(res, 502, { error: result.error });
    return json(res, 200, { tags: result.data });
  }

  json(res, 404, { error: "Not found" });
}

async function main() {
  const tokens = await loadTokens();
  if (!tokens) {
    console.error("No auth tokens found. Run: npx tsx src/mcp-auth.ts");
    process.exit(1);
  }

  let activeTokens: AuthTokens = tokens;
  if (tokens.expiresAt < Date.now() + 60_000 && tokens.refreshToken) {
    try {
      activeTokens = await refreshTokens(tokens);
      await saveTokens(activeTokens);
    } catch {
      console.error("Warning: Token refresh failed, using existing tokens");
    }
  }

  const client = new EvernoteClient(activeTokens);

  const server = createServer((req, res) => {
    handleRequest(client, req, res).catch((err) => {
      console.error("Request error:", err);
      json(res, 500, { error: "Internal server error" });
    });
  });

  server.listen(PORT, () => {
    console.log(`Evernote API server listening on http://localhost:${PORT}`);
    console.log("Endpoints:");
    console.log("  GET /api/notes");
    console.log("  GET /api/notebooks");
    console.log("  GET /api/tags");
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
