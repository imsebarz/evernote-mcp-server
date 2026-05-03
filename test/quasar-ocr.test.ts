import assert from "node:assert/strict";
import test from "node:test";

import { EvernoteClient } from "../src/client.js";
import type { AuthTokens } from "../src/types.js";

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

type CapturedRequest = {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
};

async function withMockedFetch<T>(
  payload: unknown,
  callback: (captured: CapturedRequest) => T | Promise<T>,
  init: ResponseInit = { status: 200 }
): Promise<T> {
  const previousFetch = globalThis.fetch;
  const captured: CapturedRequest = {};

  globalThis.fetch = (async (input: URL | RequestInfo, requestInit?: RequestInit) => {
    captured.url = String(input);
    captured.method = requestInit?.method;
    captured.headers = requestInit?.headers as Record<string, string>;
    captured.body = requestInit?.body
      ? JSON.parse(String(requestInit.body)) as Record<string, unknown>
      : undefined;

    return new Response(JSON.stringify(payload), {
      ...init,
      headers: { "content-type": "application/json", ...init.headers },
    });
  }) as typeof fetch;

  try {
    return await callback(captured);
  } finally {
    globalThis.fetch = previousFetch;
  }
}

test("getNoteOcrContents calls the Quasar note OCR query and maps resources", async () => {
  await withMockedFetch(
    {
      data: {
        note: {
          id: "note-1",
          resources: [
            {
              id: "resource-1",
              data: { hash: "data-hash" },
              recognition: {
                content: "<recoIndex><item><t>receipt total</t></item></recoIndex>",
                size: 52,
                hash: "recognition-hash",
              },
              searchText: "receipt total",
            },
          ],
        },
      },
    },
    async (captured) => {
      const result = await new EvernoteClient(tokens).getNoteOcrContents("note-1");

      assert.equal(result.ok, true);
      assert.deepEqual(result.data, {
        noteId: "note-1",
        resources: [
          {
            id: "resource-1",
            dataHash: "data-hash",
            recognition: {
              content: "<recoIndex><item><t>receipt total</t></item></recoIndex>",
              size: 52,
              hash: "recognition-hash",
            },
            searchText: "receipt total",
          },
        ],
      });

      assert.equal(captured.url, "https://api.evernote.com/query/v1/graphql");
      assert.equal(captured.method, "POST");
      assert.equal(captured.headers?.Authorization, "Bearer jwt-token");
      assert.equal(captured.headers?.["x-mono-authn-token"], "legacy-token");
      assert.equal(captured.headers?.["Content-Type"], "application/json");
      assert.equal(typeof JSON.parse(captured.headers?.Metadata || "{}").id, "string");
      assert.deepEqual(
        JSON.parse(captured.headers?.Metadata || "{}").entityMetadata.Note,
        [
          {
            entityID: "note-1",
            ownerID: 123,
            shardID: 123,
            generatedID: null,
            parentRef: { type: "Note", id: "note-1" },
          },
        ]
      );
      assert.equal(captured.body?.operationName, null);
      assert.deepEqual(captured.body?.variables, { id: "note-1" });
      assert.match(String(captured.body?.query), /recognition/);
      assert.match(String(captured.body?.query), /searchText/);
    }
  );
});

test("getNoteOcrContents can request recognition without search text", async () => {
  await withMockedFetch(
    {
      data: {
        note: {
          id: "note-2",
          resources: [{ id: "resource-2", recognition: { content: "ocr" } }],
        },
      },
    },
    async (captured) => {
      const result = await new EvernoteClient(tokens).getNoteOcrContents("note-2", {
        includeSearchText: false,
      });

      assert.equal(result.ok, true);
      assert.deepEqual(result.data, {
        noteId: "note-2",
        resources: [
          {
            id: "resource-2",
            recognition: { content: "ocr" },
          },
        ],
      });
      assert.equal(captured.body?.operationName, null);
      assert.doesNotMatch(String(captured.body?.query), /searchText/);
    }
  );
});

test("getResourceOcrContents calls the Quasar resource OCR query", async () => {
  await withMockedFetch(
    {
      data: {
        resource: {
          recognition: { content: "<recoIndex />" },
          searchText: "attachment text",
        },
      },
    },
    async (captured) => {
      const result = await new EvernoteClient(tokens).getResourceOcrContents(
        "resource-3",
        { noteId: "note-3" }
      );

      assert.equal(result.ok, true);
      assert.deepEqual(result.data, {
        resourceId: "resource-3",
        noteId: "note-3",
        recognition: { content: "<recoIndex />" },
        searchText: "attachment text",
      });
      assert.equal(captured.url, "https://api.evernote.com/query/v1/graphql");
      assert.deepEqual(
        JSON.parse(captured.headers?.Metadata || "{}").entityMetadata.Resource,
        [
          {
            entityID: "resource-3",
            ownerID: 123,
            shardID: 123,
            generatedID: null,
            parentRef: { type: "Note", id: "note-3" },
          },
        ]
      );
      assert.equal(captured.body?.operationName, null);
      assert.deepEqual(captured.body?.variables, { id: "resource-3" });
      assert.match(String(captured.body?.query), /resource\(resource: \$id\)/);
    }
  );
});

test("Quasar GraphQL errors become failed API responses", async () => {
  await withMockedFetch(
    { errors: [{ message: "Forbidden" }] },
    async () => {
      const result = await new EvernoteClient(tokens).getResourceOcrContents(
        "resource-4",
        { noteId: "note-4" }
      );

      assert.equal(result.ok, false);
      assert.equal(result.status, 200);
      assert.equal(result.error, "Forbidden");
    }
  );
});

test("missing Quasar note/resource payloads return not found", async () => {
  await withMockedFetch(
    { data: { note: null } },
    async () => {
      const result = await new EvernoteClient(tokens).getNoteOcrContents("missing-note");

      assert.equal(result.ok, false);
      assert.equal(result.status, 404);
      assert.equal(result.error, "Note OCR contents not found: missing-note");
    }
  );

  await withMockedFetch(
    { data: { resource: null } },
    async () => {
      const result = await new EvernoteClient(tokens).getResourceOcrContents(
        "missing-resource",
        { noteId: "missing-note" }
      );

      assert.equal(result.ok, false);
      assert.equal(result.status, 404);
      assert.equal(result.error, "Resource OCR contents not found: missing-resource");
    }
  );
});
