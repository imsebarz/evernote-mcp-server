// ============================================================
// Evernote OAuth2 + PKCE Authentication Flow
// Mimics the Ion web client's login at accounts.evernote.com
// ============================================================

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AuthTokens, OAuthConfig } from "./types.js";

// --- Constants (extracted from the Ion web client) ---

const CLIENT_ID = "evernote-web-client";
const CONSUMER_KEY = "en-web";
const USER_SERVICE_URL = "https://accounts.evernote.com";
const AUTH_AUTHORIZE_PATH = "/auth/authorize";
const AUTH_TOKEN_PATH = "/auth/token";

const DEFAULT_PORT = 10500;
const DEFAULT_TOKEN_DIR = join(homedir(), ".evernote-api");
const DEFAULT_TOKEN_PATH = join(DEFAULT_TOKEN_DIR, "tokens.json");

// --- JWT Decode Helper ---

function decodeJwtPayload(token: string): Record<string, any> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return {};
    const payload = Buffer.from(parts[1], "base64url").toString("utf-8");
    return JSON.parse(payload);
  } catch {
    return {};
  }
}

// --- PKCE Helpers ---

function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function generateState(): string {
  return randomBytes(16).toString("hex");
}

// --- Authorization URL ---

export function buildAuthorizationUrl(redirectUri: string): {
  url: string;
  state: string;
  codeVerifier: string;
} {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    client_consumer_key: CONSUMER_KEY,
    oauth_provider: "email:login",
  });

  const url = `${USER_SERVICE_URL}${AUTH_AUTHORIZE_PATH}?${params.toString()}`;
  return { url, state, codeVerifier };
}

// --- Token Exchange ---

export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<AuthTokens> {
  const tokenUrl = `${USER_SERVICE_URL}${AUTH_TOKEN_PATH}`;

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
      client_id: CLIENT_ID,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Token exchange failed (${response.status}): ${errorText}`
    );
  }

  const data = await response.json();

  // The token response contains:
  //   access_token (JWT with mono_authn_token + evernote_user_id in claims)
  //   refresh_token
  //   id_token (JWT with monolith_token + notestore_url + user_id in claims)
  //   expires_in (seconds)
  //   token_type ("Bearer")
  const accessClaims = decodeJwtPayload(data.access_token);
  const idClaims = data.id_token ? decodeJwtPayload(data.id_token) : {} as Record<string, any>;

  // Extract shard from notestore_url (e.g. "https://www.evernote.com/shard/s321/notestore")
  const notestoreUrl: string = idClaims.notestore_url || "";
  const shardMatch = notestoreUrl.match(/shard\/([^/]+)/);

  const tokens: AuthTokens = {
    jwt: data.access_token,
    refreshToken: data.refresh_token || "",
    legacyToken: accessClaims.mono_authn_token || idClaims.monolith_token || "",
    userId: String(accessClaims.evernote_user_id || idClaims.user_id || ""),
    shard: shardMatch ? shardMatch[1] : "",
    expiresAt: accessClaims.exp
      ? accessClaims.exp * 1000
      : Date.now() + (data.expires_in || 3600) * 1000,
    clientId: CLIENT_ID,
    redirectUri,
  };

  return tokens;
}

// --- Token Refresh ---

export async function refreshTokens(
  tokens: AuthTokens
): Promise<AuthTokens> {
  const tokenUrl = `${USER_SERVICE_URL}${AUTH_TOKEN_PATH}`;

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
      client_id: CLIENT_ID,
    }),
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed (${response.status})`);
  }

  const data = await response.json();

  const accessClaims = decodeJwtPayload(data.access_token);
  const idClaims = data.id_token ? decodeJwtPayload(data.id_token) : {} as Record<string, any>;

  return {
    ...tokens,
    jwt: data.access_token,
    refreshToken: data.refresh_token || tokens.refreshToken,
    legacyToken: accessClaims.mono_authn_token || idClaims.monolith_token || tokens.legacyToken,
    expiresAt: accessClaims.exp
      ? accessClaims.exp * 1000
      : Date.now() + (data.expires_in || 3600) * 1000,
  };
}

// --- Token Revocation ---

export async function revokeTokens(tokens: AuthTokens): Promise<void> {
  await fetch(`${USER_SERVICE_URL}/auth/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: tokens.jwt,
      client_id: CLIENT_ID,
    }),
  });
}

// --- Token Persistence ---

export async function saveTokens(
  tokens: AuthTokens,
  path: string = DEFAULT_TOKEN_PATH
): Promise<void> {
  const dir = path.substring(0, path.lastIndexOf("/"));
  await mkdir(dir, { recursive: true });
  await writeFile(path, JSON.stringify(tokens, null, 2), "utf-8");
}

export async function loadTokens(
  path: string = DEFAULT_TOKEN_PATH
): Promise<AuthTokens | null> {
  try {
    const data = await readFile(path, "utf-8");
    return JSON.parse(data) as AuthTokens;
  } catch {
    return null;
  }
}

// --- Full Interactive OAuth2 PKCE Flow ---
// Spins up a local HTTP server, opens the browser for login,
// captures the callback, exchanges the code, and returns tokens.

export async function authenticate(
  config: OAuthConfig = {}
): Promise<AuthTokens> {
  const port = config.port ?? DEFAULT_PORT;
  const tokenPath = config.tokenPath ?? DEFAULT_TOKEN_PATH;

  // 1. Check for existing valid tokens
  const existing = await loadTokens(tokenPath);
  if (existing && existing.expiresAt > Date.now() + 60_000) {
    console.log("✓ Using cached tokens (still valid)");
    return existing;
  }

  // 2. Try refreshing if we have a refresh token
  if (existing?.refreshToken) {
    try {
      console.log("↻ Refreshing expired tokens...");
      const refreshed = await refreshTokens(existing);
      await saveTokens(refreshed, tokenPath);
      console.log("✓ Tokens refreshed successfully");
      return refreshed;
    } catch (e) {
      console.log("⚠ Token refresh failed, starting fresh login...");
    }
  }

  // 3. Full OAuth2 PKCE flow
  const redirectUri = `http://localhost:${port}/callback`;
  const { url, state, codeVerifier } = buildAuthorizationUrl(redirectUri);

  return new Promise<AuthTokens>((resolve, reject) => {
    const server = createServer(
      async (req: IncomingMessage, res: ServerResponse) => {
        const reqUrl = new URL(req.url || "/", `http://localhost:${port}`);

        if (reqUrl.pathname === "/callback") {
          const code = reqUrl.searchParams.get("code");
          const returnedState = reqUrl.searchParams.get("state");
          const error = reqUrl.searchParams.get("error");

          if (error) {
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end(`<h1>Authentication Error</h1><p>${error}</p>`);
            server.close();
            reject(new Error(`OAuth error: ${error}`));
            return;
          }

          if (!code || returnedState !== state) {
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end("<h1>Invalid callback</h1><p>State mismatch or missing code.</p>");
            server.close();
            reject(new Error("State mismatch or missing authorization code"));
            return;
          }

          try {
            // Exchange code for tokens
            const tokens = await exchangeCodeForTokens(
              code,
              codeVerifier,
              redirectUri
            );

            // Persist tokens
            await saveTokens(tokens, tokenPath);

            // Success page
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(`
              <!DOCTYPE html>
              <html>
                <head><title>Evernote Auth Success</title></head>
                <body style="font-family: system-ui; text-align: center; padding: 60px;">
                  <h1 style="color: #00A82D;">✓ Authenticated!</h1>
                  <p>You can close this window and return to your terminal.</p>
                  <p style="color: #666; font-size: 14px;">
                    User ID: ${tokens.userId} · Shard: ${tokens.shard}
                  </p>
                </body>
              </html>
            `);

            server.close();
            console.log(`✓ Authenticated! User: ${tokens.userId}, Shard: ${tokens.shard}`);
            resolve(tokens);
          } catch (err) {
            res.writeHead(500, { "Content-Type": "text/html" });
            res.end(`<h1>Token Exchange Failed</h1><p>${err}</p>`);
            server.close();
            reject(err);
          }
        } else {
          res.writeHead(404);
          res.end("Not found");
        }
      }
    );

    server.listen(port, async () => {
      console.log(`\n🔐 Evernote OAuth2 + PKCE Authentication`);
      console.log(`   Callback server listening on http://localhost:${port}`);
      console.log(`\n📎 Opening browser for login...\n`);

      // Try to open browser
      try {
        const open = await import("open");
        await open.default(url);
      } catch {
        console.log(`⚠ Could not open browser automatically.`);
        console.log(`  Open this URL manually:\n`);
        console.log(`  ${url}\n`);
      }
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error("Authentication timed out (5 minutes)"));
    }, 5 * 60 * 1000);
  });
}
