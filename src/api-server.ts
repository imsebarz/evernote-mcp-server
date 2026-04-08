#!/usr/bin/env node
// ============================================================
// Evernote REST API + MCP Server (Combined)
//
// REST:  Full CRUD for Notes, Notebooks, Tags, Search, AI, etc.
// MCP:   Proxied via mcp-proxy for Claude agents (SSE/stream)
//
// All REST endpoints and MCP tools share the same handler layer
// (route-handlers.ts) so behavior is always 1:1.
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
import * as handlers from "./route-handlers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || process.env.MCP_PROXY_PORT || "8080", 10);
const MCP_INTERNAL_PORT = PORT + 1;
const TOKEN_PATH = process.env.EVERNOTE_TOKEN_PATH || undefined;
const API_KEY = process.env.MCP_PROXY_API_KEY || "";

// ─── Helpers ──────────────────────────────────────────────

function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-API-Key, Authorization",
  });
  res.end(JSON.stringify(data));
}

function sendResult(res: ServerResponse, result: handlers.HandlerResult) {
  if (!result.ok) {
    json(res, result.status || 500, { error: result.error });
  } else {
    json(res, result.status || 200, result.data);
  }
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk.toString()));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function extractParam(pathname: string, prefix: string): string | null {
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  if (!rest || rest === "/") return null;
  const slash = rest.indexOf("/");
  return slash === -1 ? decodeURIComponent(rest) : decodeURIComponent(rest.slice(0, slash));
}

function checkApiKey(req: IncomingMessage, res: ServerResponse): boolean {
  if (!API_KEY) return true;
  const provided = req.headers["x-api-key"] as string | undefined;
  if (provided === API_KEY) return true;
  json(res, 401, { error: "Invalid or missing X-API-Key" });
  return false;
}

// ─── MCP Proxy Child Process ──────────────────────────────

function startMcpProxy(): ChildProcess {
  const args = ["--host", "127.0.0.1", "--port", String(MCP_INTERNAL_PORT)];

  if (API_KEY) args.push("--apiKey", API_KEY);
  if (process.env.MCP_PROXY_SERVER) args.push("--server", process.env.MCP_PROXY_SERVER);

  args.push("--", "node", resolve(__dirname, "mcp-server.js"));

  const child = spawn(resolve(__dirname, "../node_modules/.bin/mcp-proxy"), args, {
    stdio: "inherit",
    env: { ...process.env },
  });

  child.on("error", (err) => console.error("mcp-proxy error:", err.message));
  child.on("exit", (code) => {
    if (code !== null && code !== 0) console.error(`mcp-proxy exited with code ${code}`);
  });

  return child;
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
  proxyReq.on("error", () => json(res, 502, { error: "MCP proxy unavailable" }));
  req.pipe(proxyReq);
}

// ─── Route Handler ────────────────────────────────────────

async function handleRequest(
  client: EvernoteClient,
  req: IncomingMessage,
  res: ServerResponse
) {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const { pathname } = url;
  const method = req.method || "GET";

  // CORS preflight
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-API-Key, Authorization",
    });
    return res.end();
  }

  // Auth check for /api/* routes
  if (pathname.startsWith("/api/") && !checkApiKey(req, res)) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Body = any;

  try {
    // ─── User & Account ───────────────────────────────
    if (method === "GET" && pathname === "/api/user") {
      return sendResult(res, await handlers.getUser(client));
    }
    if (method === "GET" && pathname === "/api/usage") {
      return sendResult(res, await handlers.getUsage(client));
    }

    // ─── Notes ────────────────────────────────────────
    if (method === "GET" && pathname === "/api/notes") {
      const maxResults = parseInt(url.searchParams.get("maxResults") || "50", 10);
      return sendResult(res, await handlers.listNotes(client, maxResults));
    }

    if (method === "POST" && pathname === "/api/notes") {
      const body: Body = await readBody(req);
      return sendResult(res, await handlers.createNote(client, body));
    }

    if (method === "POST" && pathname === "/api/notes/export") {
      const body: Body = await readBody(req);
      return sendResult(res, await handlers.exportNotes(client, body.noteIds));
    }

    // /api/notes/:id sub-routes
    if (pathname.startsWith("/api/notes/") && pathname !== "/api/notes/export") {
      const parts = pathname.slice("/api/notes/".length).split("/");
      const id = decodeURIComponent(parts[0]);
      const sub = parts[1];

      if (sub === "reminder" && method === "POST") {
        const body: Body = await readBody(req);
        return sendResult(res, await handlers.scheduleReminder(client, id, body.reminderTime));
      }
      if (sub === "thumbnail" && method === "GET") {
        return sendResult(res, handlers.getThumbnailUrl(client, id));
      }
      if (!sub) {
        if (method === "GET") return sendResult(res, await handlers.getNote(client, id));
        if (method === "PUT") {
          const body: Body = await readBody(req);
          return sendResult(res, await handlers.updateNote(client, id, body));
        }
        if (method === "DELETE") return sendResult(res, await handlers.deleteNote(client, id));
      }
    }

    // ─── Notebooks ────────────────────────────────────
    if (method === "GET" && pathname === "/api/notebooks") {
      return sendResult(res, await handlers.listNotebooks(client));
    }
    if (method === "POST" && pathname === "/api/notebooks") {
      const body: Body = await readBody(req);
      return sendResult(res, await handlers.createNotebook(client, body));
    }

    const notebookId = extractParam(pathname, "/api/notebooks/");
    if (notebookId) {
      if (method === "GET") return sendResult(res, await handlers.getNotebook(client, notebookId));
      if (method === "DELETE") return sendResult(res, await handlers.deleteNotebook(client, notebookId));
    }

    // ─── Tags ─────────────────────────────────────────
    if (method === "GET" && pathname === "/api/tags") {
      return sendResult(res, await handlers.listTags(client));
    }
    if (method === "POST" && pathname === "/api/tags") {
      const body: Body = await readBody(req);
      return sendResult(res, await handlers.createTag(client, body));
    }

    const tagId = extractParam(pathname, "/api/tags/");
    if (tagId && method === "PUT") {
      const body: Body = await readBody(req);
      return sendResult(res, await handlers.updateTag(client, tagId, body));
    }

    // ─── Search ───────────────────────────────────────
    if (method === "GET" && pathname === "/api/search") {
      const query = url.searchParams.get("q") || "";
      const maxResults = parseInt(url.searchParams.get("maxResults") || "20", 10);
      const timezone = url.searchParams.get("timezone") || undefined;
      return sendResult(res, await handlers.searchNotes(client, { query, maxResults, timezone }));
    }
    if (method === "POST" && pathname === "/api/search/answer") {
      const body: Body = await readBody(req);
      return sendResult(res, await handlers.askNotes(client, body.question));
    }
    if (method === "POST" && pathname === "/api/search/related") {
      const body: Body = await readBody(req);
      return sendResult(res, await handlers.findRelated(client, body.query));
    }

    // ─── AI ───────────────────────────────────────────
    if (method === "POST" && pathname === "/api/ai/summarize") {
      const body: Body = await readBody(req);
      return sendResult(res, await handlers.aiSummarize(client, body));
    }
    if (method === "POST" && pathname === "/api/ai/rephrase") {
      const body: Body = await readBody(req);
      return sendResult(res, await handlers.aiRephrase(client, body));
    }
    if (method === "POST" && pathname === "/api/ai/suggest-tags") {
      const body: Body = await readBody(req);
      return sendResult(res, await handlers.aiSuggestTags(client, body.noteGuid));
    }
    if (method === "POST" && pathname === "/api/ai/suggest-title") {
      const body: Body = await readBody(req);
      return sendResult(res, await handlers.aiSuggestTitle(client, body.noteGuid));
    }

    // ─── Shortcuts ────────────────────────────────────
    if (method === "POST" && pathname === "/api/shortcuts") {
      const body: Body = await readBody(req);
      return sendResult(res, await handlers.createShortcut(client, body));
    }
    const shortcutId = extractParam(pathname, "/api/shortcuts/");
    if (shortcutId && method === "DELETE") {
      return sendResult(res, await handlers.deleteShortcut(client, shortcutId));
    }

    // ─── Utilities ────────────────────────────────────
    if (method === "POST" && pathname === "/api/rich-link") {
      const body: Body = await readBody(req);
      return sendResult(res, await handlers.richLink(client, body.url));
    }

    // ─── MCP Proxy (everything else) ──────────────────
    proxyToMcp(req, res);
  } catch (err) {
    console.error("Request error:", err);
    json(res, 500, { error: "Internal server error" });
  }
}

// ─── Main ─────────────────────────────────────────────────

async function main() {
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

  const client = new EvernoteClient(activeTokens, TOKEN_PATH);
  const mcpChild = startMcpProxy();

  const server = createServer((req, res) => handleRequest(client, req, res));

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Evernote API server on http://0.0.0.0:${PORT}`);
    console.log(`  REST: /api/notes, /api/notebooks, /api/tags, /api/search, /api/ai/*, ...`);
    console.log(`  MCP:  proxied from internal :${MCP_INTERNAL_PORT}`);
    if (API_KEY) console.log(`  Auth: X-API-Key required`);
  });

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
