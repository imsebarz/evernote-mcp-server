// ============================================================
// Shared Route Handlers
// Used by BOTH the REST API server and MCP tool handlers.
// Single source of truth for all operations.
// ============================================================

import type { EvernoteClient } from "./client.js";
import type { ApiResponse } from "./types.js";
import { textToENML, markdownToENML } from "./enml.js";

// ─── Content Formatting ─────────────────────────────────────

export function formatContent(content: string, format: string = "text"): string {
  switch (format) {
    case "markdown":
      return markdownToENML(content);
    case "enml":
      return content;
    case "text":
    default:
      return textToENML(content);
  }
}

// ─── Unified Response ───────────────────────────────────────

export interface HandlerResult {
  ok: boolean;
  status: number;
  data?: unknown;
  error?: string;
}

function fromApi(result: ApiResponse<unknown>): HandlerResult {
  if (!result.ok) {
    return { ok: false, status: result.status || 500, error: result.error };
  }
  return { ok: true, status: result.status, data: result.data };
}

// ─── User & Account ─────────────────────────────────────────

export async function getUser(client: EvernoteClient): Promise<HandlerResult> {
  return fromApi(await client.getUser());
}

export async function getUsage(client: EvernoteClient): Promise<HandlerResult> {
  return fromApi(await client.getUsage());
}

// ─── Notes ──────────────────────────────────────────────────

export async function listNotes(
  client: EvernoteClient,
  maxResults = 50
): Promise<HandlerResult> {
  return fromApi(await client.listNotes(maxResults));
}

export async function getNote(
  client: EvernoteClient,
  noteId: string
): Promise<HandlerResult> {
  return fromApi(await client.getNote(noteId));
}

export async function createNote(
  client: EvernoteClient,
  args: { title: string; content: string; format?: string; notebookId?: string; tagIds?: string[] }
): Promise<HandlerResult> {
  return fromApi(
    await client.createNote({
      title: args.title,
      content: formatContent(args.content, args.format),
      notebookId: args.notebookId,
      tagIds: args.tagIds,
    })
  );
}

export async function updateNote(
  client: EvernoteClient,
  noteId: string,
  args: { title?: string; content?: string; format?: string; notebookId?: string; tagIds?: string[] }
): Promise<HandlerResult> {
  return fromApi(
    await client.updateNote({
      id: noteId,
      ...(args.title !== undefined && { title: args.title }),
      ...(args.content !== undefined && {
        content: formatContent(args.content, args.format),
      }),
      ...(args.notebookId !== undefined && { notebookId: args.notebookId }),
      ...(args.tagIds !== undefined && { tagIds: args.tagIds }),
    })
  );
}

export async function deleteNote(
  client: EvernoteClient,
  noteId: string
): Promise<HandlerResult> {
  return fromApi(await client.deleteNote(noteId));
}

export async function exportNotes(
  client: EvernoteClient,
  noteIds: string[]
): Promise<HandlerResult> {
  return fromApi(await client.exportNotes(noteIds));
}

export async function scheduleReminder(
  client: EvernoteClient,
  noteId: string,
  reminderTime: number
): Promise<HandlerResult> {
  return fromApi(await client.scheduleReminder(noteId, reminderTime));
}

// ─── Attachments ────────────────────────────────────────────

export async function listAttachments(
  client: EvernoteClient,
  noteId: string
): Promise<HandlerResult> {
  return fromApi(await client.listAttachments(noteId));
}

export async function addAttachment(
  client: EvernoteClient,
  noteId: string,
  args: { filename: string; mime?: string; data: string; dataEncoding?: "base64" | "utf8" }
): Promise<HandlerResult> {
  return fromApi(
    await client.addAttachment({
      noteId,
      filename: args.filename,
      mime: args.mime,
      data: args.data,
      dataEncoding: args.dataEncoding || "base64",
    })
  );
}

export async function getAttachment(
  client: EvernoteClient,
  resourceId: string,
  args: { includeData?: boolean } = {}
): Promise<HandlerResult> {
  return fromApi(await client.getAttachment(resourceId, args));
}

// ─── Notebooks ──────────────────────────────────────────────

export async function listNotebooks(client: EvernoteClient): Promise<HandlerResult> {
  return fromApi(await client.listNotebooks());
}

export async function getNotebook(
  client: EvernoteClient,
  notebookId: string
): Promise<HandlerResult> {
  return fromApi(await client.getNotebook(notebookId));
}

export async function createNotebook(
  client: EvernoteClient,
  args: { name: string; stack?: string }
): Promise<HandlerResult> {
  return fromApi(await client.createNotebook(args));
}

export async function deleteNotebook(
  client: EvernoteClient,
  notebookId: string
): Promise<HandlerResult> {
  return fromApi(await client.deleteNotebook(notebookId));
}

// ─── Tags ───────────────────────────────────────────────────

export async function listTags(client: EvernoteClient): Promise<HandlerResult> {
  return fromApi(await client.listTags());
}

export async function createTag(
  client: EvernoteClient,
  args: { name: string; parentId?: string }
): Promise<HandlerResult> {
  return fromApi(await client.createTag(args));
}

export async function updateTag(
  client: EvernoteClient,
  tagId: string,
  args: { name?: string; parentId?: string }
): Promise<HandlerResult> {
  return fromApi(await client.updateTag(tagId, args));
}

// ─── Search ─────────────────────────────────────────────────

export async function searchNotes(
  client: EvernoteClient,
  args: { query: string; maxResults?: number; timezone?: string }
): Promise<HandlerResult> {
  return fromApi(
    await client.searchSemantic({
      query: args.query,
      maxResults: args.maxResults ?? 20,
      timezone: args.timezone,
      keywordFallback: true,
    })
  );
}

export async function askNotes(
  client: EvernoteClient,
  question: string
): Promise<HandlerResult> {
  return fromApi(await client.semanticAnswer(question));
}

export async function findRelated(
  client: EvernoteClient,
  query: string
): Promise<HandlerResult> {
  return fromApi(await client.relatedNotesOrAnswer(query));
}

// ─── AI Features ────────────────────────────────────────────

export async function aiSummarize(
  client: EvernoteClient,
  args: { content: string; style?: string }
): Promise<HandlerResult> {
  return fromApi(
    await client.aiSummarize({
      content: args.content,
      style: (args.style as any) || "bullet", // eslint-disable-line @typescript-eslint/no-explicit-any
    })
  );
}

export async function aiRephrase(
  client: EvernoteClient,
  args: { content: string; style?: string }
): Promise<HandlerResult> {
  return fromApi(
    await client.aiRephrase({
      content: args.content,
      style: (args.style as any) || "concise", // eslint-disable-line @typescript-eslint/no-explicit-any
    })
  );
}

export async function aiSuggestTags(
  client: EvernoteClient,
  noteGuid: string
): Promise<HandlerResult> {
  return fromApi(await client.aiSuggestTags(noteGuid));
}

export async function aiSuggestTitle(
  client: EvernoteClient,
  noteGuid: string
): Promise<HandlerResult> {
  return fromApi(await client.aiSuggestTitle(noteGuid));
}

// ─── OCR / Recognition ─────────────────────────────────────

export async function getNoteOcrContents(
  client: EvernoteClient,
  noteId: string,
  args: { includeSearchText?: boolean } = {}
): Promise<HandlerResult> {
  return fromApi(await client.getNoteOcrContents(noteId, args));
}

export async function getResourceOcrContents(
  client: EvernoteClient,
  resourceId: string,
  args: { noteId?: string } = {}
): Promise<HandlerResult> {
  return fromApi(await client.getResourceOcrContents(resourceId, args));
}

// ─── Shortcuts ──────────────────────────────────────────────

export async function createShortcut(
  client: EvernoteClient,
  args: { targetId: string; targetType: "note" | "notebook" | "tag" | "search" }
): Promise<HandlerResult> {
  return fromApi(
    await client.createShortcut({
      targetId: args.targetId,
      targetType: args.targetType,
    })
  );
}

export async function deleteShortcut(
  client: EvernoteClient,
  shortcutId: string
): Promise<HandlerResult> {
  return fromApi(await client.deleteShortcut(shortcutId));
}

// ─── Utilities ──────────────────────────────────────────────

export function getThumbnailUrl(
  client: EvernoteClient,
  noteId: string
): HandlerResult {
  return { ok: true, status: 200, data: { url: client.getThumbnailUrl(noteId) } };
}

export async function richLink(
  client: EvernoteClient,
  url: string
): Promise<HandlerResult> {
  return fromApi(await client.richLink(url));
}
