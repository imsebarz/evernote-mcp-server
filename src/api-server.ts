#!/usr/bin/env node
// ============================================================
// Combined Evernote Server
// REST API endpoints + MCP proxy in a single process.
// REST:  GET /api/notes, /api/notebooks, /api/tags
// MCP:   Everything else proxied to mcp-proxy (SSE/stream)
// ============================================================

import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { EvernoteClient } from "./client.js";
import { loadTokens, refreshTokens, saveTokens } from "./auth.js";
import type { AuthTokens } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || process.env.MCP_PROXY_PORT || "8080", 10);
const MCP_INTERNAL_PORT = PORT + 1;
const TOKEN_PATH = process.env.EVERNOTE_TOKEN_PATH || undefined;

// ─── Helpers ──────────────────────────────────────────────

function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data));
}

function proxyToMcp(req: IncomingMessage, res: ServerResponse) {
  const proxyReq = httpRequest(
    {
      hostname: "127.0.0.1",
      port: MCP_INTERNAL_PORT,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${MCP_INTERNAL_PORT}` },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode!, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on("error", () => {
    json(res, 502, { error: "MCP proxy unavailable" });
  });

  req.pipe(proxyReq);
}

// ─── MCP Proxy Child Process ──────────────────────────────

function startMcpProxy(): ChildProcess {
  const args = [
    "--host", "127.0.0.1",
    "--port", String(MCP_INTERNAL_PORT),
  ];

  if (process.env.MCP_PROXY_API_KEY) {
    args.push("--apiKey", process.env.MCP_PROXY_API_KEY);
  }
  if (process.env.MCP_PROXY_SERVER) {
    args.push("--server", process.env.MCP_PROXY_SERVER);
  }

  args.push("--", "node", resolve(__dirname, "mcp-server.js"));

  const child = spawn(resolve(__dirname, "../node_modules/.bin/mcp-proxy"), args, {
    stdio: "inherit",
    env: { ...process.env },
  });

  child.on("error", (err) => console.error("mcp-proxy error:", err.message));
  child.on("exit", (code) => {
    if (code !== null && code !== 0) {
      console.error(`mcp-proxy exited with code ${code}`);
    }
  });

  return child;
}

// ─── Main ─────────────────────────────────────────────────

async function main() {
  // 1. Load tokens for REST client
  const tokens = await loadTokens(TOKEN_PATH);
  if (!tokens) {
    console.error("No auth tokens found. Run: npx tsx src/mcp-auth.ts");
    process.exit(1);
  }

  let activeTokens: AuthTokens = tokens;
  if (tokens.expiresAt < Date.now() + 60_000 && tokens.refreshToken) {
    try {
      activeTokens = await refreshTokens(tokens);
      await saveTokens(activeTokens, TOKEN_PATH);
      console.error("Tokens refreshed");
    } catch {
      console.error("Warning: Token refresh failed, using existing tokens");
    }
  }

  const client = new EvernoteClient(activeTokens);

  // 2. Start mcp-proxy on internal port
  const mcpChild = startMcpProxy();

  // 3. Combined HTTP server
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    // CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      return res.end();
    }

    // REST endpoints
    try {
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
    } catch (err) {
      console.error("REST error:", err);
      return json(res, 500, { error: "Internal server error" });
    }

    // Everything else → mcp-proxy
    proxyToMcp(req, res);
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Combined server on http://0.0.0.0:${PORT}`);
    console.log(`  REST: /api/notes, /api/notebooks, /api/tags`);
    console.log(`  MCP:  proxied from internal :${MCP_INTERNAL_PORT}`);
  });

  // Cleanup on shutdown
  const shutdown = () => {
    mcpChild.kill();
    server.close();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
