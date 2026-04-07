#!/usr/bin/env tsx
// ============================================================
// Test flow v3:
// Strategy: redirect to https://www.evernote.com/ (root, NOT /client/web)
// The root page won't consume the code, so we capture it from the URL.
// Write code to /tmp file, then exchange + test API calls.
// ============================================================

import { randomBytes, createHash } from "node:crypto";
import { writeFile, readFile } from "node:fs/promises";
import { saveTokens } from "./auth.js";
import { EvernoteClient } from "./client.js";
import { textToENML } from "./enml.js";
import type { AuthTokens } from "./types.js";

const CLIENT_ID = "evernote-web-client";
const CONSUMER_KEY = "en-web";

// Try multiple redirect URIs
const REDIRECT_URIS = [
  "https://www.evernote.com/",
  "https://www.evernote.com/client/web",
  "https://www.evernote.com/Login.action",
];

const mode = process.argv[2] || "auth"; // "auth" or "exchange" or "test"

if (mode === "auth") {
  // Generate PKCE for each redirect URI option
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  const state = randomBytes(16).toString("hex");

  // Save PKCE data
  await writeFile("/tmp/evernote-pkce.json", JSON.stringify({ codeVerifier, state }));

  // Generate URLs for each redirect URI
  for (const redirectUri of REDIRECT_URIS) {
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
    console.log(`\n--- redirect_uri: ${redirectUri} ---`);
    console.log(`https://accounts.evernote.com/auth/authorize?${params.toString()}`);
  }

  console.log("\nPKCE saved to /tmp/evernote-pkce.json");
  console.log("Navigate browser to one of the URLs above.");
  console.log("After redirect, capture the ?code= from the URL.");
  console.log("Then run: npx tsx src/test-flow.ts exchange <code> <redirect_uri_used>");

} else if (mode === "exchange") {
  const code = process.argv[3];
  const redirectUri = process.argv[4] || REDIRECT_URIS[0];

  if (!code) {
    console.error("Usage: npx tsx src/test-flow.ts exchange <code> [redirect_uri]");
    process.exit(1);
  }

  const pkce = JSON.parse(await readFile("/tmp/evernote-pkce.json", "utf-8"));

  console.log("Exchanging code for tokens...");
  console.log("  code:", code.substring(0, 20) + "...");
  console.log("  redirect_uri:", redirectUri);
  console.log("  code_verifier:", pkce.codeVerifier.substring(0, 20) + "...");

  const tokenUrl = "https://accounts.evernote.com/auth/token";
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      code_verifier: pkce.codeVerifier,
      client_id: CLIENT_ID,
      redirect_uri: redirectUri,
    }),
  });

  console.log("\nResponse status:", response.status);
  const body = await response.text();
  console.log("Response body:", body.substring(0, 1000));

  if (!response.ok) {
    console.error("\nFAILED. Try with a different redirect_uri.");
    process.exit(1);
  }

  const data = JSON.parse(body);
  console.log("\nResponse keys:", Object.keys(data));

  // Save raw response for analysis
  await writeFile("/tmp/evernote-token-response.json", JSON.stringify(data, null, 2));
  console.log("Raw response saved to /tmp/evernote-token-response.json");

  // Map to our token structure
  const tokens: AuthTokens = {
    jwt: data.access_token || data.jwt || data.token || "",
    refreshToken: data.refresh_token || data.refreshToken || "",
    legacyToken: data.edam_token || data.edamToken || data.mono_token || "",
    userId: String(data.edam_userId || data.userId || data.user_id || ""),
    shard: data.edam_shard || data.shard || "",
    expiresAt: data.expires_at
      ? data.expires_at * 1000
      : Date.now() + (data.expires_in || 3600) * 1000,
    clientId: CLIENT_ID,
    redirectUri: redirectUri,
  };

  console.log("\n=== PARSED TOKENS ===");
  console.log("  jwt:", tokens.jwt ? tokens.jwt.substring(0, 40) + "..." : "EMPTY");
  console.log("  legacyToken:", tokens.legacyToken ? tokens.legacyToken.substring(0, 30) + "..." : "EMPTY");
  console.log("  refreshToken:", tokens.refreshToken ? "present (" + tokens.refreshToken.length + " chars)" : "EMPTY");
  console.log("  userId:", tokens.userId || "EMPTY");
  console.log("  shard:", tokens.shard || "EMPTY");

  await saveTokens(tokens);
  console.log("\nTokens saved! Now run: npx tsx src/test-flow.ts test");

} else if (mode === "test") {
  // Load tokens and test all API endpoints
  const tokensRaw = await readFile(
    (await import("node:os")).homedir() + "/.evernote-api/tokens.json",
    "utf-8"
  );
  const tokens: AuthTokens = JSON.parse(tokensRaw);

  console.log("Loaded tokens:");
  console.log("  userId:", tokens.userId);
  console.log("  shard:", tokens.shard);
  console.log("  jwt:", tokens.jwt ? "present" : "MISSING");
  console.log("  legacyToken:", tokens.legacyToken ? "present" : "MISSING");

  const client = new EvernoteClient(tokens);

  const tests = [
    {
      name: "getUser",
      fn: () => client.getUser(),
    },
    {
      name: "getUsage",
      fn: () => client.getUsage(),
    },
    {
      name: "searchSemantic",
      fn: () => client.searchSemantic({ query: "test", maxResults: 3 }),
    },
    {
      name: "createNote",
      fn: () =>
        client.createNote({
          title: "API Test — " + new Date().toISOString(),
          content: textToENML("Created by evernote-unofficial-api test."),
        }),
    },
    {
      name: "aiSummarize",
      fn: () =>
        client.aiSummarize({
          content: "Revenue grew 15%. Mobile usage up 23%. Churn decreased 8%.",
          style: "bullet",
        }),
    },
    {
      name: "aiSuggestTags",
      fn: () => client.aiSuggestTags("Meeting about Q2 roadmap and priorities"),
    },
    {
      name: "richLink",
      fn: () => client.richLink("https://www.anthropic.com"),
    },
    {
      name: "getThumbnailUrl",
      fn: () => Promise.resolve({ ok: true, status: 200, data: client.getThumbnailUrl("test-id") }),
    },
  ];

  console.log("\n=== RUNNING API TESTS ===\n");
  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    process.stdout.write(`${test.name}... `);
    try {
      const result = await test.fn();
      const r = result as any;
      if (r.ok) {
        console.log(`✓ (${r.status})`);
        const dataStr = JSON.stringify(r.data);
        if (dataStr) console.log(`  → ${dataStr.substring(0, 200)}`);
        passed++;
      } else {
        console.log(`✗ (${r.status}) ${r.error?.substring(0, 150)}`);
        failed++;
      }
    } catch (e: any) {
      console.log(`✗ EXCEPTION: ${e.message?.substring(0, 150)}`);
      failed++;
    }
  }

  console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===\n`);
}
