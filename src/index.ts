// ============================================================
// Evernote Unofficial API — Public Exports
// ============================================================

// Client
export { EvernoteClient } from "./client.js";

// Authentication
export {
  authenticate,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  refreshTokens,
  revokeTokens,
  saveTokens,
  loadTokens,
} from "./auth.js";

// ENML Helpers
export {
  wrapInENML,
  textToENML,
  markdownToENML,
  enmlToText,
  todoItem,
  checklistToENML,
} from "./enml.js";

// Types
export type {
  AuthTokens,
  OAuthConfig,
  EvernoteHeaders,
  ApiResponse,
  Note,
  NoteAttributes,
  CreateNoteParams,
  UpdateNoteParams,
  Notebook,
  CreateNotebookParams,
  Tag,
  CreateTagParams,
  SearchParams,
  SearchResult,
  Resource,
  CreateAttachmentParams,
  Shortcut,
  User,
  UsageInfo,
  SummarizeStyle,
  RephraseStyle,
  AISummarizeParams,
  AIRephraseParams,
  SyncState,
  SyncChunkFilter,
} from "./types.js";
