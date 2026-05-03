import { createHash } from "node:crypto";

import type { AttachmentDataEncoding } from "./types.js";

const MIME_BY_EXTENSION: Record<string, string> = {
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  gif: "image/gif",
  heic: "image/heic",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  pdf: "application/pdf",
  png: "image/png",
  potx: "application/vnd.openxmlformats-officedocument.presentationml.template",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  rtf: "application/rtf",
  txt: "text/plain",
  webp: "image/webp",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip",
};

export function inferAttachmentMimeType(
  filename: string,
  mime?: string
): string {
  if (mime?.trim()) return mime.trim();

  const extension = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return extension ? MIME_BY_EXTENSION[extension] || "application/octet-stream" : "application/octet-stream";
}

export function normalizeAttachmentData(
  data: Buffer | Uint8Array | string,
  encoding: AttachmentDataEncoding = "base64"
): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  return Buffer.from(data, encoding === "utf8" ? "utf8" : "base64");
}

export function attachmentBodyHash(data: Buffer | Uint8Array): Buffer {
  return createHash("md5").update(data).digest();
}

export function attachmentBodyHashHex(data: Buffer | Uint8Array): string {
  return attachmentBodyHash(data).toString("hex");
}

function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function createEnMediaTag(mime: string, hashHex: string): string {
  return `<en-media type="${escapeXmlAttribute(mime)}" hash="${escapeXmlAttribute(hashHex)}"/>`;
}

export function appendAttachmentToEnml(
  content: string | undefined,
  mime: string,
  hashHex: string
): string {
  const block = `<div>${createEnMediaTag(mime, hashHex)}</div>`;
  const source = content?.trim()
    ? content
    : `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">
<en-note></en-note>`;

  if (/<\/en-note>\s*$/i.test(source)) {
    return source.replace(/<\/en-note>\s*$/i, `${block}</en-note>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">
<en-note>${source}${block}</en-note>`;
}
