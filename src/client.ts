// ============================================================
// Evernote API Gateway Client
// REST client for https://api.evernote.com/v1/*
// ============================================================

import type {
  AuthTokens,
  EvernoteHeaders,
  ApiResponse,
  Note,
  CreateNoteParams,
  UpdateNoteParams,
  Notebook,
  CreateNotebookParams,
  Tag,
  CreateTagParams,
  SearchParams,
  SearchResult,
  Shortcut,
  User,
  UsageInfo,
  AISummarizeParams,
  AIRephraseParams,
  CreateAttachmentParams,
  SyncState,
} from "./types.js";
import { refreshTokens, saveTokens } from "./auth.js";
import {
  createNotebookViaNoteStore,
  createTagViaNoteStore,
  deleteNoteViaNoteStore,
  deleteNotebookViaNoteStore,
  getNotebookViaNoteStore,
  listNotebooksViaNoteStore,
  listTagsViaNoteStore,
  updateNoteViaNoteStore,
  updateTagViaNoteStore,
} from "./notestore.js";

// --- Constants ---

const API_GATEWAY = "https://api.evernote.com";
const MONOLITH = "https://www.evernote.com";
const FEATURE_VERSION = "4";
const CONDUIT_VERSION = "2.111.0";

// --- Client ---

export class EvernoteClient {
  private tokens: AuthTokens;
  private tokenPath?: string;

  constructor(tokens: AuthTokens, tokenPath?: string) {
    this.tokens = tokens;
    this.tokenPath = tokenPath;
  }

  // ─── Internal HTTP helpers ───────────────────────────────

  private buildHeaders(json = true): EvernoteHeaders {
    return {
      Authorization: `Bearer ${this.tokens.jwt}`,
      "x-mono-authn-token": this.tokens.legacyToken,
      "x-feature-version": FEATURE_VERSION,
      "x-conduit-version": CONDUIT_VERSION,
      "Content-Type": json ? "application/json" : "application/octet-stream",
    };
  }

  private async ensureValidToken(): Promise<void> {
    // Refresh if token expires within 60 seconds
    if (this.tokens.expiresAt < Date.now() + 60_000 && this.tokens.refreshToken) {
      try {
        this.tokens = await refreshTokens(this.tokens);
        if (this.tokenPath) {
          await saveTokens(this.tokens, this.tokenPath);
        }
      } catch {
        // If refresh fails, continue with existing token
        // The server will return 401 and the caller can re-authenticate
      }
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | number | boolean | undefined>,
    base: string = API_GATEWAY
  ): Promise<ApiResponse<T>> {
    await this.ensureValidToken();

    let url = `${base}${path}`;

    // Append query parameters
    if (query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          params.set(key, String(value));
        }
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    const options: RequestInit = {
      method,
      headers: this.buildHeaders(),
    };

    if (body !== undefined && method !== "GET") {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        const errorText = await response.text();
        return {
          ok: false,
          status: response.status,
          error: `${response.status} ${response.statusText}: ${errorText}`,
        };
      }

      // Some endpoints return no content
      const contentType = response.headers.get("content-type") || "";
      if (
        response.status === 204 ||
        !contentType.includes("application/json")
      ) {
        return { ok: true, status: response.status, data: undefined as T };
      }

      const data = (await response.json()) as T;
      return { ok: true, status: response.status, data };
    } catch (err) {
      return {
        ok: false,
        status: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ─── User ────────────────────────────────────────────────

  /** Get the currently authenticated user's profile */
  async getUser(): Promise<ApiResponse<User>> {
    return this.request<User>("GET", "/v1/users/me");
  }

  /** Get usage statistics (upload limits, note count, etc.) */
  async getUsage(): Promise<ApiResponse<UsageInfo>> {
    return this.request<UsageInfo>("GET", "/v1/users/me/usage");
  }

  /** List all devices connected to this account */
  async getDevices(): Promise<ApiResponse<unknown>> {
    return this.request("GET", "/v1/users/me/devices");
  }

  // ─── List endpoints ──────────────────────────────────────

  /** List all notebooks */
  async listNotebooks(): Promise<ApiResponse<Notebook[]>> {
    return listNotebooksViaNoteStore(this.tokens);
  }

  /** List all tags */
  async listTags(): Promise<ApiResponse<Tag[]>> {
    return listTagsViaNoteStore(this.tokens);
  }

  /** List notes (uses search with wildcard) */
  async listNotes(maxResults: number = 50): Promise<ApiResponse<SearchResult[]>> {
    return this.request<SearchResult[]>("GET", "/v1/search/semantic", undefined, {
      naturalLanguageQuery: "*",
      maxResults,
      clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      keywordSearchFallback: true,
    });
  }

  // ─── Get by ID ──────────────────────────────────────────

  /** Get a single note by ID (full content) */
  async getNote(noteId: string): Promise<ApiResponse<Note>> {
    return this.request<Note>(
      "GET",
      `/v1/notes/${encodeURIComponent(noteId)}`
    );
  }

  /** Get a single notebook by ID */
  async getNotebook(notebookId: string): Promise<ApiResponse<Notebook>> {
    return getNotebookViaNoteStore(this.tokens, notebookId);
  }

  // ─── Notes ───────────────────────────────────────────────

  /**
   * Create a new note.
   *
   * Content must be valid ENML wrapped in <en-note> tags:
   * ```
   * <?xml version="1.0" encoding="UTF-8"?>
   * <!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">
   * <en-note><p>Hello World</p></en-note>
   * ```
   */
  async createNote(params: CreateNoteParams): Promise<ApiResponse<Note>> {
    const seed = crypto.randomUUID();
    const now = Date.now();

    return this.request<Note>("POST", "/v1/notes", {
      seed,
      created: new Date(now).toISOString(),
      updated: new Date(now).toISOString(),
      title: params.title,
      enmlContent: params.content,
      tagIds: params.tagIds || [],
      fallbackToDefaultNotebook: !params.notebookId,
      parent: params.notebookId
        ? { id: params.notebookId, type: "NOTEBOOK" }
        : undefined,
      attributes: params.attributes || {},
    });
  }

  /**
   * Update an existing note.
   * Uses the Thrift monolith endpoint since the API Gateway
   * doesn't expose a direct update — updates go through Conduit/NSync.
   */
  async updateNote(params: UpdateNoteParams): Promise<ApiResponse<Note>> {
    return updateNoteViaNoteStore(this.tokens, params);
  }

  /**
   * Delete a note (moves to trash).
   * Uses the NSync command service.
   */
  async deleteNote(noteId: string): Promise<ApiResponse<void>> {
    return deleteNoteViaNoteStore(this.tokens, noteId);
  }

  /** Request access to a shared note */
  async requestNoteAccess(noteId: string): Promise<ApiResponse<void>> {
    return this.request<void>(
      "POST",
      `/v1/notes/${encodeURIComponent(noteId)}/request-access`
    );
  }

  /** Schedule a reminder for a note */
  async scheduleReminder(
    noteId: string,
    reminderTime: number
  ): Promise<ApiResponse<void>> {
    return this.request<void>(
      "POST",
      `/v1/notes/${encodeURIComponent(noteId)}/schedule-satellite-reminder`,
      { reminderTime }
    );
  }

  // ─── Notebooks ───────────────────────────────────────────

  /**
   * Create a new notebook.
   * Uses the NSync command service.
   */
  async createNotebook(
    params: CreateNotebookParams
  ): Promise<ApiResponse<Notebook>> {
    return createNotebookViaNoteStore(this.tokens, params);
  }

  /** Delete a notebook by ID */
  async deleteNotebook(notebookId: string): Promise<ApiResponse<void>> {
    return deleteNotebookViaNoteStore(this.tokens, notebookId);
  }

  // ─── Tags ────────────────────────────────────────────────

  /**
   * Create a new tag.
   * Uses the NSync command service.
   */
  async createTag(params: CreateTagParams): Promise<ApiResponse<Tag>> {
    return createTagViaNoteStore(this.tokens, params);
  }

  /** Update a tag's name or parent */
  async updateTag(
    tagId: string,
    params: Partial<CreateTagParams>
  ): Promise<ApiResponse<Tag>> {
    return updateTagViaNoteStore(this.tokens, tagId, params);
  }

  // ─── Search ──────────────────────────────────────────────

  /**
   * Semantic (AI-powered) search across your notes.
   * Uses Evernote's built-in semantic search engine.
   * Returns hits with noteGuid and relevance score.
   */
  async searchSemantic(params: SearchParams): Promise<ApiResponse<SearchResult[]>> {
    const tz = params.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    return this.request<SearchResult[]>("GET", "/v1/search/semantic", undefined, {
      naturalLanguageQuery: params.query,
      maxResults: params.maxResults ?? 20,
      clientTimeZone: tz,
      keywordSearchFallback: params.keywordFallback ?? true,
    });
  }

  /**
   * Get AI-generated answer based on your notes.
   * The AI will find relevant notes and synthesize an answer.
   * Returns { answer: string, sourceNoteGuids: string[] }
   */
  async semanticAnswer(query: string): Promise<ApiResponse<{ answer: string; sourceNoteGuids: string[] }>> {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return this.request("GET", "/v1/search/generate-semantic-answer", undefined, {
      naturalLanguageQuery: query,
      clientTimeZone: tz,
    });
  }

  /**
   * Get related notes or AI-generated answer.
   * Returns intent ("related_notes" | "answer") plus results.
   */
  async relatedNotesOrAnswer(query: string): Promise<ApiResponse<unknown>> {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return this.request("GET", "/v1/search/related-notes-or-answer", undefined, {
      naturalLanguageQuery: query,
      clientTimeZone: tz,
    });
  }

  // ─── Shortcuts ───────────────────────────────────────────

  /** Create a shortcut to a note, notebook, tag, or search */
  async createShortcut(shortcut: Omit<Shortcut, "id">): Promise<ApiResponse<Shortcut>> {
    return this.request<Shortcut>("POST", "/v1/shortcuts", shortcut);
  }

  /** Update a shortcut */
  async updateShortcut(
    id: string,
    update: Partial<Shortcut>
  ): Promise<ApiResponse<Shortcut>> {
    return this.request<Shortcut>(
      "PATCH",
      `/v1/shortcuts/${encodeURIComponent(id)}`,
      update
    );
  }

  /** Delete a shortcut */
  async deleteShortcut(id: string): Promise<ApiResponse<void>> {
    return this.request<void>(
      "DELETE",
      `/v1/shortcuts/${encodeURIComponent(id)}`
    );
  }

  // ─── Attachments ─────────────────────────────────────────

  /** Get a pre-signed upload URL for an attachment */
  async createUploadUrl(params: {
    filename: string;
    mime: string;
    size: number;
  }): Promise<ApiResponse<{ uploadUrl: string; fileToken: string }>> {
    return this.request("POST", "/v1/attachments/create-upload-url", params);
  }

  // ─── Workspaces (Spaces) ─────────────────────────────────

  /** Delete a workspace/space */
  async deleteWorkspace(workspaceId: string): Promise<ApiResponse<void>> {
    return this.request<void>(
      "DELETE",
      `/v1/workspaces/${encodeURIComponent(workspaceId)}`
    );
  }

  /** List business directory workspaces */
  async listBusinessWorkspaces(): Promise<ApiResponse<unknown>> {
    return this.request("GET", "/v1/workspaces/business-directory");
  }

  // ─── AI Features ─────────────────────────────────────────

  /** Summarize text using Evernote AI */
  async aiSummarize(params: AISummarizeParams): Promise<ApiResponse<{ summary: string }>> {
    return this.request("POST", "/v1/ai/summarize", params);
  }

  /** Rephrase text using Evernote AI */
  async aiRephrase(params: AIRephraseParams): Promise<ApiResponse<{ result: string }>> {
    return this.request("POST", "/v1/ai/rephrase", params);
  }

  /**
   * Get AI tag suggestions for a note.
   * Returns { suggestedExistingTags: string[], suggestedNewTags: string[] }
   */
  async aiSuggestTags(noteGuid: string): Promise<ApiResponse<{ suggestedExistingTags: string[]; suggestedNewTags: string[] }>> {
    return this.request("POST", "/v1/ai/suggest-tags", { noteGuid });
  }

  /**
   * Get AI title suggestion for a note.
   * Returns { suggestedTitle: string }
   */
  async aiSuggestTitle(noteGuid: string): Promise<ApiResponse<{ suggestedTitle: string }>> {
    return this.request("POST", "/v1/ai/suggest-title", { noteGuid });
  }

  /** AI copilot — send a prompt */
  async aiCopilot(prompt: string, context?: string): Promise<ApiResponse<unknown>> {
    return this.request("POST", "/v1/ai/copilot/send", { prompt, context });
  }

  /** Detect if text is AI-generated */
  async aiDetectText(text: string): Promise<ApiResponse<{ isAi: boolean; confidence: number }>> {
    return this.request("POST", "/v1/ai/detect-ai-text", { text });
  }

  // ─── Rich Links & Productivity ───────────────────────────

  /**
   * Generate a rich link preview for a URL.
   * Returns { url, pageTitle, faviconUrl, logoUrl, imageUrl, description }
   */
  async richLink(url: string): Promise<ApiResponse<unknown>> {
    return this.request("GET", "/v1/links/rich-link", undefined, { url });
  }

  /** OCR a business card image */
  async ocrBusinessCard(imageData: string): Promise<ApiResponse<unknown>> {
    return this.request("POST", "/v1/ocr/business-card", { image: imageData });
  }

  // ─── Notes Import/Export ─────────────────────────────────

  /** Prepare a notes import job */
  async prepareImport(): Promise<ApiResponse<unknown>> {
    return this.request("POST", "/v1/notes/prepare-import");
  }

  /** Trigger a notes import */
  async triggerImport(importData: unknown): Promise<ApiResponse<unknown>> {
    return this.request("POST", "/v1/notes/import", importData);
  }

  /** Export notes by IDs or by notebook */
  async exportNotes(noteIds?: string[], notebookGuids?: string[]): Promise<ApiResponse<unknown>> {
    return this.request("POST", "/v1/notes/export", {
      ...(noteIds && { noteGuids: noteIds }),
      ...(notebookGuids && { notebookGuids }),
    });
  }

  // ─── Billing / Subscription (read-only) ──────────────────

  /** Get billing information */
  async getBilling(): Promise<ApiResponse<unknown>> {
    return this.request("GET", "/v1/users/me/billing/individual");
  }

  /** Get payment history */
  async getPayments(): Promise<ApiResponse<unknown>> {
    return this.request("GET", "/v1/users/me/billing/individual/payments");
  }

  /** Get pricing for a subscription level */
  async getPricing(level: string): Promise<ApiResponse<unknown>> {
    return this.request(
      "GET",
      `/v1/users/pricing/${encodeURIComponent(level)}`
    );
  }

  // ─── Conduit Sync Database ───────────────────────────────

  /**
   * Download the prebuilt sync database.
   * This is a SQLite binary blob used by the Conduit worker
   * for offline-first sync. Advanced use only.
   */
  async downloadSyncDatabase(version: string): Promise<ApiResponse<ArrayBuffer>> {
    await this.ensureValidToken();

    const url = `${API_GATEWAY}/v1/conduit/database?version=${encodeURIComponent(version)}`;
    const response = await fetch(url, {
      headers: this.buildHeaders(false),
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: `Failed to download sync DB: ${response.status}`,
      };
    }

    const data = await response.arrayBuffer();
    return { ok: true, status: response.status, data };
  }

  // ─── Monolith (Thrift) Proxy ─────────────────────────────
  // For operations that only exist on the legacy Thrift API.
  // These endpoints require the legacy auth token.

  /** Get note thumbnail URL */
  getThumbnailUrl(noteId: string): string {
    return `https://public.www.evernote.com/resources/note/thumbnail/${this.tokens.shard}/${noteId}`;
  }

  /** Get user photo URL */
  getUserPhotoUrl(size: number = 112): string {
    return `${MONOLITH}/shard/${this.tokens.shard}/user/${this.tokens.userId}/photo?t=0&size=${size}`;
  }

  /** Get shared note URL */
  getSharedNoteUrl(noteId: string, ownerId: string): string {
    return `${MONOLITH}/shard/${this.tokens.shard}/nl/${ownerId}/${noteId}`;
  }

  // ─── Raw request (for undocumented endpoints) ────────────

  /**
   * Make a raw request to any API Gateway endpoint.
   * Useful for calling endpoints not yet wrapped in this client.
   */
  async raw<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | number | boolean | undefined>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(method, path, body, query);
  }

  /**
   * Make a raw request to the Monolith (www.evernote.com).
   * For legacy Thrift endpoints — you'll need to handle
   * binary Thrift encoding yourself.
   */
  async rawMonolith<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | number | boolean | undefined>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(method, path, body, query, MONOLITH);
  }

  // ─── Token accessors ─────────────────────────────────────

  /** Get current auth tokens (for manual use or debugging) */
  getTokens(): AuthTokens {
    return { ...this.tokens };
  }

  /** Get the user's shard ID */
  getShard(): string {
    return this.tokens.shard;
  }

  /** Get the user's ID */
  getUserId(): string {
    return this.tokens.userId;
  }
}
