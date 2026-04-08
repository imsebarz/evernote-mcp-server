#!/usr/bin/env node
// ============================================================
// Evernote MCP Server
// Full-featured MCP server using shared route handlers.
// Transport: stdio (for Claude Desktop / Claude Code)
//
// All tools use the same handler functions as the REST API
// (route-handlers.ts) — behavior is always 1:1.
// ============================================================

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";

import { EvernoteClient } from "./client.js";
import { loadTokens, refreshTokens, saveTokens } from "./auth.js";
import type { AuthTokens } from "./types.js";
import * as handlers from "./route-handlers.js";
import type { HandlerResult } from "./route-handlers.js";

// ─── Tool Definitions ──────────────────────────────────────

const tools: Tool[] = [
  // --- Notes ---
  {
    name: "create_note",
    description:
      "Create a new note in Evernote. Supports plain text, markdown, or raw ENML content. " +
      "Returns the created note's ID and metadata.",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Note title" },
        content: { type: "string", description: "Note content (plain text, markdown, or ENML)" },
        format: { type: "string", enum: ["text", "markdown", "enml"], description: 'Content format (default: "text")', default: "text" },
        notebookId: { type: "string", description: "Target notebook ID. If omitted, uses default notebook." },
        tagIds: { type: "array", items: { type: "string" }, description: "Array of tag IDs to apply" },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "update_note",
    description: "Update an existing note's title, content, or tags.",
    inputSchema: {
      type: "object" as const,
      properties: {
        noteId: { type: "string", description: "ID of the note to update" },
        title: { type: "string", description: "New title (optional)" },
        content: { type: "string", description: "New content (optional)" },
        format: { type: "string", enum: ["text", "markdown", "enml"], description: "Content format", default: "text" },
        tagIds: { type: "array", items: { type: "string" }, description: "New tag IDs (replaces existing)" },
      },
      required: ["noteId"],
    },
  },
  {
    name: "delete_note",
    description: "Move a note to the trash.",
    inputSchema: {
      type: "object" as const,
      properties: { noteId: { type: "string", description: "ID of the note to delete" } },
      required: ["noteId"],
    },
  },
  {
    name: "get_note",
    description: "Get a note by ID with its full content.",
    inputSchema: {
      type: "object" as const,
      properties: { noteId: { type: "string", description: "ID of the note to retrieve" } },
      required: ["noteId"],
    },
  },
  {
    name: "export_notes",
    description: "Export one or more notes. Returns the exported data.",
    inputSchema: {
      type: "object" as const,
      properties: { noteIds: { type: "array", items: { type: "string" }, description: "Array of note IDs to export" } },
      required: ["noteIds"],
    },
  },
  {
    name: "schedule_reminder",
    description: "Schedule a reminder for a note at a specific time.",
    inputSchema: {
      type: "object" as const,
      properties: {
        noteId: { type: "string", description: "ID of the note" },
        reminderTime: { type: "number", description: "Reminder time as Unix timestamp in milliseconds" },
      },
      required: ["noteId", "reminderTime"],
    },
  },

  // --- Notebooks ---
  {
    name: "list_notebooks",
    description: "List all notebooks in the account.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_notebook",
    description: "Get a notebook by ID.",
    inputSchema: {
      type: "object" as const,
      properties: { notebookId: { type: "string", description: "ID of the notebook" } },
      required: ["notebookId"],
    },
  },
  {
    name: "create_notebook",
    description: "Create a new notebook, optionally inside a stack.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Notebook name" },
        stack: { type: "string", description: "Stack name (optional grouping)" },
      },
      required: ["name"],
    },
  },
  {
    name: "delete_notebook",
    description: "Permanently delete a notebook.",
    inputSchema: {
      type: "object" as const,
      properties: { notebookId: { type: "string", description: "ID of the notebook to delete" } },
      required: ["notebookId"],
    },
  },

  // --- Tags ---
  {
    name: "list_tags",
    description: "List all tags in the account.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "create_tag",
    description: "Create a new tag.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Tag name" },
        parentId: { type: "string", description: "Parent tag ID for nested tags (optional)" },
      },
      required: ["name"],
    },
  },
  {
    name: "update_tag",
    description: "Rename a tag or change its parent.",
    inputSchema: {
      type: "object" as const,
      properties: {
        tagId: { type: "string", description: "ID of the tag to update" },
        name: { type: "string", description: "New tag name" },
        parentId: { type: "string", description: "New parent tag ID" },
      },
      required: ["tagId"],
    },
  },

  // --- Search ---
  {
    name: "search_notes",
    description:
      "Search notes using AI-powered semantic search. Understands natural language queries.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Natural language search query" },
        maxResults: { type: "number", description: "Maximum results (default: 20)", default: 20 },
        timezone: { type: "string", description: 'Timezone for date-relative queries (e.g. "America/New_York")' },
      },
      required: ["query"],
    },
  },
  {
    name: "ask_notes",
    description: "Ask a question and get an AI-generated answer based on your notes.",
    inputSchema: {
      type: "object" as const,
      properties: { question: { type: "string", description: "Question to answer from your notes" } },
      required: ["question"],
    },
  },
  {
    name: "find_related",
    description: "Find notes related to a query, or get an AI answer if applicable.",
    inputSchema: {
      type: "object" as const,
      properties: { query: { type: "string", description: "Topic or question to find related notes for" } },
      required: ["query"],
    },
  },

  // --- AI Features ---
  {
    name: "ai_summarize",
    description: "Summarize text using Evernote AI. Styles: bullet, email, meeting, paragraph, multi_paragraph, twitter.",
    inputSchema: {
      type: "object" as const,
      properties: {
        content: { type: "string", description: "Text content to summarize" },
        style: { type: "string", enum: ["bullet", "email", "meeting", "multi_paragraph", "paragraph", "twitter"], description: "Summary style", default: "bullet" },
      },
      required: ["content"],
    },
  },
  {
    name: "ai_rephrase",
    description: "Rephrase text using Evernote AI. Styles: concise, formal, friendly, funny, engaging, empathetic, human-like.",
    inputSchema: {
      type: "object" as const,
      properties: {
        content: { type: "string", description: "Text content to rephrase" },
        style: { type: "string", enum: ["concise", "formal", "friendly", "funny", "engaging", "empathetic", "human-like"], description: "Rephrase style", default: "concise" },
      },
      required: ["content"],
    },
  },
  {
    name: "ai_suggest_tags",
    description: "Get AI-suggested tags for a note.",
    inputSchema: {
      type: "object" as const,
      properties: { noteGuid: { type: "string", description: "The GUID of the note" } },
      required: ["noteGuid"],
    },
  },
  {
    name: "ai_suggest_title",
    description: "Get an AI-suggested title for a note.",
    inputSchema: {
      type: "object" as const,
      properties: { noteGuid: { type: "string", description: "The GUID of the note" } },
      required: ["noteGuid"],
    },
  },

  // --- User & Account ---
  {
    name: "get_user",
    description: "Get the currently authenticated Evernote user's profile.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_usage",
    description: "Get account usage statistics: upload limits, note count, etc.",
    inputSchema: { type: "object" as const, properties: {} },
  },

  // --- Shortcuts ---
  {
    name: "create_shortcut",
    description: "Create a shortcut (bookmark) to a note, notebook, or tag.",
    inputSchema: {
      type: "object" as const,
      properties: {
        targetId: { type: "string", description: "ID of the item to create a shortcut to" },
        targetType: { type: "string", enum: ["note", "notebook", "tag", "search"], description: "Type of the target item" },
      },
      required: ["targetId", "targetType"],
    },
  },
  {
    name: "delete_shortcut",
    description: "Delete a shortcut by its ID.",
    inputSchema: {
      type: "object" as const,
      properties: { shortcutId: { type: "string", description: "ID of the shortcut to delete" } },
      required: ["shortcutId"],
    },
  },

  // --- Utilities ---
  {
    name: "get_thumbnail_url",
    description: "Get the thumbnail image URL for a note.",
    inputSchema: {
      type: "object" as const,
      properties: { noteId: { type: "string", description: "ID of the note" } },
      required: ["noteId"],
    },
  },
  {
    name: "rich_link",
    description: "Generate a rich link preview for a URL.",
    inputSchema: {
      type: "object" as const,
      properties: { url: { type: "string", description: "URL to generate a rich preview for" } },
      required: ["url"],
    },
  },
];

// ─── Response Helper ───────────────────────────────────────

function formatResult(result: HandlerResult): {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
} {
  if (!result.ok) {
    return { content: [{ type: "text", text: `Error: ${result.error}` }], isError: true };
  }
  const text =
    result.data !== undefined
      ? typeof result.data === "string"
        ? result.data
        : JSON.stringify(result.data, null, 2)
      : "Success (no content returned)";
  return { content: [{ type: "text", text }] };
}

// ─── Tool Handler (uses shared route-handlers) ─────────────

async function handleToolCall(
  client: EvernoteClient,
  name: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  let result: HandlerResult;

  switch (name) {
    // Notes
    case "create_note":
      result = await handlers.createNote(client, args as any); break; // eslint-disable-line @typescript-eslint/no-explicit-any
    case "update_note":
      result = await handlers.updateNote(client, args.noteId as string, args as any); break; // eslint-disable-line @typescript-eslint/no-explicit-any
    case "delete_note":
      result = await handlers.deleteNote(client, args.noteId as string); break;
    case "get_note":
      result = await handlers.getNote(client, args.noteId as string); break;
    case "export_notes":
      result = await handlers.exportNotes(client, args.noteIds as string[]); break;
    case "schedule_reminder":
      result = await handlers.scheduleReminder(client, args.noteId as string, args.reminderTime as number); break;

    // Notebooks
    case "list_notebooks":
      result = await handlers.listNotebooks(client); break;
    case "get_notebook":
      result = await handlers.getNotebook(client, args.notebookId as string); break;
    case "create_notebook":
      result = await handlers.createNotebook(client, args as any); break; // eslint-disable-line @typescript-eslint/no-explicit-any
    case "delete_notebook":
      result = await handlers.deleteNotebook(client, args.notebookId as string); break;

    // Tags
    case "list_tags":
      result = await handlers.listTags(client); break;
    case "create_tag":
      result = await handlers.createTag(client, args as any); break; // eslint-disable-line @typescript-eslint/no-explicit-any
    case "update_tag":
      result = await handlers.updateTag(client, args.tagId as string, args as any); break; // eslint-disable-line @typescript-eslint/no-explicit-any

    // Search
    case "search_notes":
      result = await handlers.searchNotes(client, args as any); break; // eslint-disable-line @typescript-eslint/no-explicit-any
    case "ask_notes":
      result = await handlers.askNotes(client, args.question as string); break;
    case "find_related":
      result = await handlers.findRelated(client, args.query as string); break;

    // AI
    case "ai_summarize":
      result = await handlers.aiSummarize(client, args as any); break; // eslint-disable-line @typescript-eslint/no-explicit-any
    case "ai_rephrase":
      result = await handlers.aiRephrase(client, args as any); break; // eslint-disable-line @typescript-eslint/no-explicit-any
    case "ai_suggest_tags":
      result = await handlers.aiSuggestTags(client, args.noteGuid as string); break;
    case "ai_suggest_title":
      result = await handlers.aiSuggestTitle(client, args.noteGuid as string); break;

    // User
    case "get_user":
      result = await handlers.getUser(client); break;
    case "get_usage":
      result = await handlers.getUsage(client); break;

    // Shortcuts
    case "create_shortcut":
      result = await handlers.createShortcut(client, args as any); break; // eslint-disable-line @typescript-eslint/no-explicit-any
    case "delete_shortcut":
      result = await handlers.deleteShortcut(client, args.shortcutId as string); break;

    // Utilities
    case "get_thumbnail_url":
      result = handlers.getThumbnailUrl(client, args.noteId as string); break;
    case "rich_link":
      result = await handlers.richLink(client, args.url as string); break;

    default:
      return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  }

  return formatResult(result);
}

// ─── Main ──────────────────────────────────────────────────

async function main() {
  const tokenPath = process.env.EVERNOTE_TOKEN_PATH || undefined;
  const tokens = await loadTokens(tokenPath);

  if (!tokens) {
    console.error(
      "No auth tokens found. Run authentication first:\n\n" +
        "  npx tsx src/mcp-auth.ts\n\n" +
        "Tokens are saved to ~/.evernote-api/tokens.json"
    );
    process.exit(1);
  }

  let activeTokens: AuthTokens = tokens;
  if (tokens.expiresAt < Date.now() + 60_000 && tokens.refreshToken) {
    try {
      activeTokens = await refreshTokens(tokens);
      await saveTokens(activeTokens, tokenPath);
      console.error("Tokens refreshed successfully");
    } catch {
      console.error("Warning: Token refresh failed, using existing tokens");
    }
  }

  const client = new EvernoteClient(activeTokens, tokenPath);

  const server = new Server(
    { name: "evernote-mcp-server", version: "3.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      return await handleToolCall(client, name, (args || {}) as Record<string, unknown>);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("Evernote MCP Server started (stdio transport)");
  console.error(`Tools available: ${tools.length}`);
  console.error(`User: ${activeTokens.userId} | Shard: ${activeTokens.shard}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
