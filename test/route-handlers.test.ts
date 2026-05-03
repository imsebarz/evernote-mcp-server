import assert from "node:assert/strict";
import test from "node:test";

import { getNote, updateNote } from "../src/route-handlers.js";

test("updateNote passes notebookId through to the client", async () => {
  let captured: unknown;
  const client = {
    async updateNote(args: unknown) {
      captured = args;
      return {
        ok: true,
        status: 200,
        data: { id: "note-1", title: "Updated", notebookId: "notebook-1" },
      };
    },
  };

  const result = await updateNote(client as never, "note-1", {
    title: "Updated",
    notebookId: "notebook-1",
    tagIds: ["tag-1"],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(captured, {
    id: "note-1",
    title: "Updated",
    notebookId: "notebook-1",
    tagIds: ["tag-1"],
  });
});

test("getNote passes includeContent through to the client", async () => {
  let captured: unknown;
  const client = {
    async getNote(noteId: string, options: unknown) {
      captured = { noteId, options };
      return {
        ok: true,
        status: 200,
        data: { id: noteId, title: "Metadata only" },
      };
    },
  };

  const result = await getNote(client as never, "note-1", { includeContent: false });

  assert.equal(result.ok, true);
  assert.deepEqual(captured, {
    noteId: "note-1",
    options: { includeContent: false },
  });
});
