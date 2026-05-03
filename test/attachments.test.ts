import assert from "node:assert/strict";
import test from "node:test";

import {
  appendAttachmentToEnml,
  attachmentBodyHashHex,
  createEnMediaTag,
  inferAttachmentMimeType,
  normalizeAttachmentData,
} from "../src/attachments.js";

test("infers common document attachment MIME types", () => {
  assert.equal(inferAttachmentMimeType("scan.pdf"), "application/pdf");
  assert.equal(inferAttachmentMimeType("proposal.doc"), "application/msword");
  assert.equal(
    inferAttachmentMimeType("proposal.docx"),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
  assert.equal(inferAttachmentMimeType("deck.ppt"), "application/vnd.ms-powerpoint");
  assert.equal(
    inferAttachmentMimeType("deck.pptx"),
    "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  );
  assert.equal(inferAttachmentMimeType("report.xls"), "application/vnd.ms-excel");
  assert.equal(
    inferAttachmentMimeType("report.xlsx"),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  assert.equal(inferAttachmentMimeType("unknown.bin"), "application/octet-stream");
});

test("uses explicit attachment MIME type before filename inference", () => {
  assert.equal(inferAttachmentMimeType("file.bin", "application/custom"), "application/custom");
});

test("normalizes base64 and utf8 attachment data", () => {
  assert.deepEqual(normalizeAttachmentData("SGVsbG8=", "base64"), Buffer.from("Hello"));
  assert.deepEqual(normalizeAttachmentData("Hello", "utf8"), Buffer.from("Hello"));
  assert.deepEqual(normalizeAttachmentData(new Uint8Array([1, 2, 3])), Buffer.from([1, 2, 3]));
});

test("computes Evernote attachment body hashes as MD5 hex", () => {
  assert.equal(attachmentBodyHashHex(Buffer.from("Hello")), "8b1a9953c4611296a827abf8c47804d7");
});

test("builds escaped ENML media tags", () => {
  assert.equal(
    createEnMediaTag("application/x-test&quote", "abc123"),
    '<en-media type="application/x-test&amp;quote" hash="abc123"/>'
  );
});

test("appends attachment media tags before closing en-note", () => {
  const enml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">
<en-note><div>Existing</div></en-note>`;

  assert.equal(
    appendAttachmentToEnml(enml, "application/pdf", "abc123"),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">
<en-note><div>Existing</div><div><en-media type="application/pdf" hash="abc123"/></div></en-note>`
  );
});

test("wraps missing note content in valid ENML when appending attachment", () => {
  assert.match(
    appendAttachmentToEnml(undefined, "application/pdf", "abc123"),
    /<en-note><div><en-media type="application\/pdf" hash="abc123"\/><\/div><\/en-note>/
  );
});
