import assert from "node:assert/strict";
import test from "node:test";

import { EvernoteClient } from "../src/client.js";
import {
  compareVersions,
  getEvernoteVersionFromPlist,
  getInstalledEvernoteVersion,
  selectGetNoteBackend,
} from "../src/evernote-version.js";
import type { AuthTokens, Note } from "../src/types.js";

async function withEnv<T>(
  name: string,
  value: string | undefined,
  callback: () => T | Promise<T>
): Promise<T> {
  const previous = process.env[name];

  try {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }

    return await callback();
  } finally {
    if (previous === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = previous;
    }
  }
}

const tokens: AuthTokens = {
  jwt: "jwt-token",
  refreshToken: "",
  legacyToken: "legacy-token",
  userId: "123",
  shard: "s123",
  expiresAt: Date.now() + 3_600_000,
  clientId: "evernote-web-client",
  redirectUri: "https://www.evernote.com/",
};

test("compares semantic version strings numerically", () => {
  assert.equal(compareVersions("11.13.0", "11.13"), 0);
  assert.equal(compareVersions("11.13.2", "11.13.0"), 1);
  assert.equal(compareVersions("11.12.99", "11.13.0"), -1);
  assert.equal(compareVersions("12.0.0", "11.99.99"), 1);
});

test("parses Evernote desktop version from Info.plist XML", () => {
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
  <dict>
    <key>CFBundleName</key>
    <string>Evernote</string>
    <key>CFBundleShortVersionString</key>
    <string>11.13.2</string>
  </dict>
</plist>`;

  assert.equal(getEvernoteVersionFromPlist(plist), "11.13.2");
  assert.equal(getEvernoteVersionFromPlist("<plist></plist>"), undefined);
});

test("selects the old API Gateway getNote route for older desktop versions", async () => {
  await withEnv("EVERNOTE_GET_NOTE_BACKEND", undefined, () => {
    assert.equal(selectGetNoteBackend(""), "api-gateway");
    assert.equal(selectGetNoteBackend("11.12.9"), "api-gateway");
  });
});

test("selects the NoteStore getNote route for newer desktop versions", async () => {
  await withEnv("EVERNOTE_GET_NOTE_BACKEND", undefined, () => {
    assert.equal(selectGetNoteBackend("11.13.0"), "notestore");
    assert.equal(selectGetNoteBackend("11.13.2"), "notestore");
    assert.equal(selectGetNoteBackend("12.0.0"), "notestore");
  });
});

test("honors explicit getNote backend overrides", async () => {
  await withEnv("EVERNOTE_GET_NOTE_BACKEND", "old", () => {
    assert.equal(selectGetNoteBackend("12.0.0"), "api-gateway");
  });

  await withEnv("EVERNOTE_GET_NOTE_BACKEND", "new", () => {
    assert.equal(selectGetNoteBackend("11.0.0"), "notestore");
  });
});

test("uses EVERNOTE_DESKTOP_VERSION before inspecting the local app", async () => {
  await withEnv("EVERNOTE_GET_NOTE_BACKEND", undefined, async () => {
    await withEnv("EVERNOTE_DESKTOP_VERSION", "10.99.1", () => {
      assert.equal(getInstalledEvernoteVersion(), "10.99.1");
      assert.equal(selectGetNoteBackend(), "api-gateway");
    });
  });
});

test("EvernoteClient.getNote keeps the old API Gateway request when selected", async () => {
  const previousFetch = globalThis.fetch;
  let requestedUrl: string | undefined;
  let requestedMethod: string | undefined;
  let requestedHeaders: HeadersInit | undefined;

  const note: Note = {
    id: "note id/with spaces",
    title: "Legacy note",
    content: "<en-note>Legacy content</en-note>",
  };

  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    requestedUrl = String(input);
    requestedMethod = init?.method;
    requestedHeaders = init?.headers;

    return new Response(JSON.stringify(note), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await withEnv("EVERNOTE_GET_NOTE_BACKEND", "old", async () => {
      const result = await new EvernoteClient(tokens).getNote(note.id);
      assert.equal(result.ok, true);
      assert.deepEqual(result.data, note);
    });
  } finally {
    globalThis.fetch = previousFetch;
  }

  assert.equal(
    requestedUrl,
    "https://api.evernote.com/v1/notes/note%20id%2Fwith%20spaces"
  );
  assert.equal(requestedMethod, "GET");
  assert.equal(
    (requestedHeaders as Record<string, string>).Authorization,
    "Bearer jwt-token"
  );
  assert.equal(
    (requestedHeaders as Record<string, string>)["x-mono-authn-token"],
    "legacy-token"
  );
});
