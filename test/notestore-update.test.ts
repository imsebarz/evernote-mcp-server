import assert from "node:assert/strict";
import test from "node:test";

import { updateRequiresNoteContent } from "../src/notestore.js";

test("metadata-only note updates do not require fetching note content", () => {
  assert.equal(updateRequiresNoteContent({ id: "note-1", title: "Updated title" }), false);
  assert.equal(updateRequiresNoteContent({ id: "note-1", notebookId: "notebook-1" }), false);
  assert.equal(updateRequiresNoteContent({ id: "note-1", tagIds: ["tag-1"] }), false);
});

test("content note updates still fetch content", () => {
  assert.equal(updateRequiresNoteContent({ id: "note-1", content: "" }), true);
  assert.equal(updateRequiresNoteContent({ id: "note-1", content: "<en-note>Body</en-note>" }), true);
});
