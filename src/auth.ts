// ============================================================
// Evernote OAuth2 + PKCE Authentication Flow
// Mimics the Ion web client's login at accounts.evernote.com
// ============================================================

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createInterface } from "node:readline";
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

// --- Helper: read one line from stdin ---

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (answer: string) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// --- Full Interactive OAuth2 PKCE Flow ---
// Opens the browser for Evernote login. After the redirect back to
// evernote.com, the user pastes the resulting URL so we can extract
// the authorization code and exchange it for tokens.
//
// Why not localhost callback?  Evernote's auth server rejects
// redirect_uri values pointing to localhost — only
// https://www.evernote.com/client/web is whitelisted for the
// evernote-web-client OAuth2 client_id.

const WEB_REDIRECT_URI = "https://www.evernote.com/client/web";

export async function authenticate(
  config: OAuthConfig = {}
): Promise<AuthTokens> {
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
    } catch {
      console.log("⚠ Token refresh failed, starting fresh login...");
    }
  }

  // 3. Full OAuth2 PKCE flow (browser-based)
  const { url, state, codeVerifier } = buildAuthorizationUrl(WEB_REDIRECT_URI);

  console.log(`\n🔐 Evernote OAuth2 + PKCE Authentication\n`);

  // Try to open browser automatically
  try {
    const open = await import("open");
    await open.default(url);
    console.log(`📎 Browser opened for login.`);
  } catch {
    console.log(`⚠ Could not open browser automatically.`);
    console.log(`  Open this URL manually:\n`);
    console.log(`  ${url}\n`);
  }

  console.log(`\nAfter logging in, Evernote will redirect you to a page.`);
  console.log(`The URL bar will briefly show a "?code=..." parameter`);
  console.log(`(the Evernote SPA may strip it quickly — that's OK).`);
  console.log(`\nCopy the FULL URL from your browser and paste it here.`);
  console.log(`Tip: In Chrome, open DevTools → Console and run:`);
  console.log(`  performance.getEntriesByType('navigation')[0].name`);
  console.log(`to recover the code even after the SPA strips it.\n`);

  const pastedUrl = await prompt("Paste URL here: ");

  // Extract code from the pasted URL
  let code: string | null = null;
  try {
    const parsed = new URL(pastedUrl);
    code = parsed.searchParams.get("code");
  } catch {
    // Maybe they just pasted the code directly
    if (pastedUrl.length > 30 && !pastedUrl.includes(" ")) {
      code = pastedUrl;
    }
  }

  if (!code) {
    throw new Error(
      "Could not extract authorization code from the URL. " +
        "Make sure you paste the full URL including the ?code= parameter."
    );
  }

  // Verify state if present
  try {
    const parsed = new URL(pastedUrl);
    const returnedState = parsed.searchParams.get("state");
    if (returnedState && returnedState !== state) {
      throw new Error("OAuth state mismatch — possible CSRF attack.");
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("state mismatch")) throw e;
    // Not a valid URL, skip state check
  }

  console.log(`\n↻ Exchanging code for tokens...`);

  const tokens = await exchangeCodeForTokens(code, codeVerifier, WEB_REDIRECT_URI);

  await saveTokens(tokens, tokenPath);

  console.log(`✓ Authenticated! User: ${tokens.userId}, Shard: ${tokens.shard}`);
  console.log(`  Tokens saved to ${tokenPath}\n`);

  return tokens;
}
