import assert from "node:assert/strict";
import test from "node:test";

import { loadTokens } from "../src/auth.js";
import { EvernoteClient } from "../src/client.js";

async function loadLiveClient(): Promise<EvernoteClient> {
  const tokens = await loadTokens(process.env.EVERNOTE_TOKEN_PATH);
  assert.ok(tokens, "No Evernote tokens found. Run npm run auth first.");
  return new EvernoteClient(tokens, process.env.EVERNOTE_TOKEN_PATH);
}

test(
  "live Quasar note OCR query returns a response",
  {
    skip: process.env.EVERNOTE_LIVE_OCR_NOTE_ID
      ? false
      : "set EVERNOTE_LIVE_OCR_NOTE_ID to run",
  },
  async () => {
    const client = await loadLiveClient();
    const result = await client.getNoteOcrContents(
      process.env.EVERNOTE_LIVE_OCR_NOTE_ID as string
    );

    assert.equal(result.ok, true, result.error);
    assert.equal(result.data?.noteId, process.env.EVERNOTE_LIVE_OCR_NOTE_ID);
    assert.ok(Array.isArray(result.data?.resources));
  }
);

test(
  "live Quasar resource OCR query returns a response",
  {
    skip: process.env.EVERNOTE_LIVE_OCR_RESOURCE_ID
      ? false
      : "set EVERNOTE_LIVE_OCR_RESOURCE_ID to run",
  },
  async () => {
    const client = await loadLiveClient();
    const result = await client.getResourceOcrContents(
      process.env.EVERNOTE_LIVE_OCR_RESOURCE_ID as string,
      { noteId: process.env.EVERNOTE_LIVE_OCR_NOTE_ID }
    );

    assert.equal(result.ok, true, result.error);
    assert.equal(
      result.data?.resourceId,
      process.env.EVERNOTE_LIVE_OCR_RESOURCE_ID
    );
  }
);
