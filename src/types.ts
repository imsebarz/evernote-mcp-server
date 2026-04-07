// ============================================================
// Evernote Unofficial API — Type Definitions
// Reverse-engineered from Ion v11.10.1 / Conduit v2.111.0
// ============================================================

// --- Auth ---

export interface AuthTokens {
  /** NAP JWT token — used for API Gateway Bearer auth */
  jwt: string;
  /** Refresh token for obtaining new JWTs */
  refreshToken: string;
  /** Legacy Evernote auth token — used for Monolith/Thrift endpoints */
  legacyToken: string;
  /** User ID */
  userId: string;
  /** Shard ID (e.g. "s321") */
  shard: string;
  /** When the JWT expires */
  expiresAt: number;
  /** OAuth2 client ID used */
  clientId: string;
  /** Redirect URI used in the flow */
  redirectUri: string;
}

export interface OAuthConfig {
  /** Port for the local callback server (default: 10500) */
  port?: number;
  /** Path to persist tokens (default: ~/.evernote-api/tokens.json) */
  tokenPath?: string;
}

// --- API Headers ---

export interface EvernoteHeaders {
  Authorization: string;
  "x-mono-authn-token": string;
  "x-feature-version": string;
  "x-conduit-version": string;
  "Content-Type": string;
  [key: string]: string;
}

// --- Notes ---

export interface Note {
  id: string;
  title: string;
  content?: string;
  created?: number;
  updated?: number;
  deleted?: number;
  notebookId?: string;
  tagIds?: string[];
  attributes?: NoteAttributes;
  resources?: Resource[];
}

export interface NoteAttributes {
  author?: string;
  source?: string;
  sourceURL?: string;
  sourceApplication?: string;
  contentClass?: string;
  subjectDate?: number;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  reminderTime?: number;
  reminderDoneTime?: number;
  placeName?: string;
}

export interface CreateNoteParams {
  title: string;
  /** ENML content — wrapped in <en-note> tags */
  content: string;
  /** Notebook ID — if omitted, uses default notebook */
  notebookId?: string;
  tagIds?: string[];
  attributes?: NoteAttributes;
}

export interface UpdateNoteParams {
  id: string;
  title?: string;
  content?: string;
  tagIds?: string[];
  attributes?: NoteAttributes;
}

// --- Notebooks ---

export interface Notebook {
  id: string;
  name: string;
  stack?: string;
  defaultNotebook?: boolean;
  created?: number;
  updated?: number;
  sharedNotebookIds?: string[];
}

export interface CreateNotebookParams {
  name: string;
  stack?: string;
}

// --- Tags ---

export interface Tag {
  id: string;
  name: string;
  parentId?: string;
}

export interface CreateTagParams {
  name: string;
  parentId?: string;
}

// --- Search ---

export interface SearchParams {
  /** Natural language query for semantic search */
  query: string;
  /** Maximum number of results */
  maxResults?: number;
  /** Timezone for date-relative queries (e.g. "America/New_York") */
  timezone?: string;
  /** Fall back to keyword search if semantic returns nothing */
  keywordFallback?: boolean;
}

export interface SearchResult {
  noteId: string;
  title: string;
  snippet?: string;
  score?: number;
  notebookId?: string;
  created?: number;
  updated?: number;
}

// --- Resources/Attachments ---

export interface Resource {
  id: string;
  noteId: string;
  mime: string;
  width?: number;
  height?: number;
  filename?: string;
  size?: number;
  hash?: string;
}

export interface CreateAttachmentParams {
  noteId: string;
  filename: string;
  mime: string;
  data: Buffer | Uint8Array;
}

// --- Shortcuts ---

export interface Shortcut {
  id: string;
  targetId: string;
  targetType: "note" | "notebook" | "tag" | "search";
  sortOrder?: number;
}

// --- AI Features ---

export type SummarizeStyle =
  | "bullet"
  | "email"
  | "meeting"
  | "multi_paragraph"
  | "paragraph"
  | "twitter";

export type RephraseStyle =
  | "concise"
  | "formal"
  | "friendly"
  | "funny"
  | "engaging"
  | "empathetic"
  | "human-like";

export interface AISummarizeParams {
  content: string;
  style: SummarizeStyle;
}

export interface AIRephraseParams {
  content: string;
  style: RephraseStyle;
}

// --- User ---

export interface User {
  id: string;
  username?: string;
  email?: string;
  name?: string;
  serviceLevel?: string;
  created?: number;
  updated?: number;
  shard?: string;
}

export interface UsageInfo {
  uploadLimit?: number;
  uploadLimitEnd?: number;
  uploaded?: number;
  noteCount?: number;
  notebookCount?: number;
  tagCount?: number;
  savedSearchCount?: number;
}

// --- API Response wrapper ---

export interface ApiResponse<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

// --- Thrift sync (for advanced use) ---

export interface SyncState {
  currentTime: number;
  fullSyncBefore: number;
  updateCount: number;
  uploaded: number;
}

export interface SyncChunkFilter {
  afterUSN?: number;
  maxEntries?: number;
  includeNotes?: boolean;
  includeNotebooks?: boolean;
  includeTags?: boolean;
  includeSearches?: boolean;
  includeResources?: boolean;
  includeExpunged?: boolean;
}
