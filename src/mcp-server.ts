#!/usr/bin/env node
// ============================================================
// Evernote MCP Server
// Full-featured MCP server using the reverse-engineered API.
// Supports: Notes CRUD, Notebooks, Tags, Search, AI, Export
// Transport: stdio (for Claude Desktop / Claude Code)
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
import {
  textToENML,
  markdownToENML,
  wrapInENML,
  enmlToText,
  checklistToENML,
} from "./enml.js";
import type { AuthTokens, ApiResponse } from "./types.js";

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
        title: {
          type: "string",
          description: "Note title",
        },
        content: {
          type: "string",
          description: "Note content (plain text, markdown, or ENML)",
        },
        format: {
          type: "string",
          enum: ["text", "markdown", "enml"],
          description:
            'Content format: "text" (default), "markdown", or "enml" (raw ENML)',
          default: "text",
        },
        notebookId: {
          type: "string",
          description:
            "Target notebook ID. If omitted, uses default notebook.",
        },
        tagIds: {
          type: "array",
          items: { type: "string" },
          description: "Array of tag IDs to apply to the note",
        },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "update_note",
    description:
      "Update an existing note's title, content, or tags.",
    inputSchema: {
      type: "object" as const,
      properties: {
        noteId: {
          type: "string",
          description: "ID of the note to update",
        },
        title: {
          type: "string",
          description: "New title (optional)",
        },
        content: {
          type: "string",
          description: "New content (optional)",
        },
        format: {
          type: "string",
          enum: ["text", "markdown", "enml"],
          description: "Content format",
          default: "text",
        },
        tagIds: {
          type: "array",
          items: { type: "string" },
          description: "New tag IDs (replaces existing tags)",
        },
      },
      required: ["noteId"],
    },
  },
  {
    name: "delete_note",
    description: "Move a note to the trash.",
    inputSchema: {
      type: "object" as const,
      properties: {
        noteId: {
          type: "string",
          description: "ID of the note to delete",
        },
      },
      required: ["noteId"],
    },
  },
  {
    name: "export_notes",
    description:
      "Export one or more notes. Returns the exported data.",
    inputSchema: {
      type: "object" as const,
      properties: {
        noteIds: {
          type: "array",
          items: { type: "string" },
          description: "Array of note IDs to export",
        },
      },
      required: ["noteIds"],
    },
  },
  {
    name: "schedule_reminder",
    description: "Schedule a reminder for a note at a specific time.",
    inputSchema: {
      type: "object" as const,
      properties: {
        noteId: {
          type: "string",
          description: "ID of the note",
        },
        reminderTime: {
          type: "number",
          description: "Reminder time as Unix timestamp in milliseconds",
        },
      },
      required: ["noteId", "reminderTime"],
    },
  },

  // --- Notebooks ---
  {
    name: "create_notebook",
    description: "Create a new notebook, optionally inside a stack.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "Notebook name",
        },
        stack: {
          type: "string",
          description: "Stack name (optional grouping)",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "delete_notebook",
    description: "Permanently delete a notebook.",
    inputSchema: {
      type: "object" as const,
      properties: {
        notebookId: {
          type: "string",
          description: "ID of the notebook to delete",
        },
      },
      required: ["notebookId"],
    },
  },

  // --- Tags ---
  {
    name: "create_tag",
    description: "Create a new tag.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "Tag name",
        },
        parentId: {
          type: "string",
          description: "Parent tag ID for nested tags (optional)",
        },
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
        tagId: {
          type: "string",
          description: "ID of the tag to update",
        },
        name: {
          type: "string",
          description: "New tag name",
        },
        parentId: {
          type: "string",
          description: "New parent tag ID",
        },
      },
      required: ["tagId"],
    },
  },

  // --- Search ---
  {
    name: "search_notes",
    description:
      "Search notes using AI-powered semantic search. Understands natural language " +
      'queries like "meeting notes from last week" or "recipes with chicken".',
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Natural language search query",
        },
        maxResults: {
          type: "number",
          description: "Maximum results to return (default: 20)",
          default: 20,
        },
        timezone: {
          type: "string",
          description:
            'Timezone for date-relative queries (e.g. "America/New_York")',
        },
      },
      required: ["query"],
    },
  },
  {
    name: "ask_notes",
    description:
      "Ask a question and get an AI-generated answer based on your Evernote notes. " +
      'The AI searches your notes and synthesizes an answer. Example: "What was decided in the Q1 planning meeting?"',
    inputSchema: {
      type: "object" as const,
      properties: {
        question: {
          type: "string",
          description: "Question to answer from your notes",
        },
      },
      required: ["question"],
    },
  },
  {
    name: "find_related",
    description:
      "Find notes related to a query, or get an AI answer if applicable.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Topic or question to find related notes for",
        },
      },
      required: ["query"],
    },
  },

  // --- AI Features ---
  {
    name: "ai_summarize",
    description:
      "Summarize text using Evernote's built-in AI. " +
      "Styles: bullet, email, meeting, paragraph, multi_paragraph, twitter.",
    inputSchema: {
      type: "object" as const,
      properties: {
        content: {
          type: "string",
          description: "Text content to summarize",
        },
        style: {
          type: "string",
          enum: [
            "bullet",
            "email",
            "meeting",
            "multi_paragraph",
            "paragraph",
            "twitter",
          ],
          description: "Summary style",
          default: "bullet",
        },
      },
      required: ["content"],
    },
  },
  {
    name: "ai_rephrase",
    description:
      "Rephrase text using Evernote AI. " +
      "Styles: concise, formal, friendly, funny, engaging, empathetic, human-like.",
    inputSchema: {
      type: "object" as const,
      properties: {
        content: {
          type: "string",
          description: "Text content to rephrase",
        },
        style: {
          type: "string",
          enum: [
            "concise",
            "formal",
            "friendly",
            "funny",
            "engaging",
            "empathetic",
            "human-like",
          ],
          description: "Rephrase style",
          default: "concise",
        },
      },
      required: ["content"],
    },
  },
  {
    name: "ai_suggest_tags",
    description: "Get AI-suggested tags for a note. Returns both existing and new tag suggestions.",
    inputSchema: {
      type: "object" as const,
      properties: {
        noteGuid: {
          type: "string",
          description: "The GUID of the note to suggest tags for",
        },
      },
      required: ["noteGuid"],
    },
  },
  {
    name: "ai_suggest_title",
    description: "Get an AI-suggested title for a note.",
    inputSchema: {
      type: "object" as const,
      properties: {
        noteGuid: {
          type: "string",
          description: "The GUID of the note to suggest a title for",
        },
      },
      required: ["noteGuid"],
    },
  },

  // --- User & Account ---
  {
    name: "get_user",
    description: "Get the currently authenticated Evernote user's profile.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "get_usage",
    description:
      "Get account usage statistics: upload limits, note count, etc.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },

  // --- Shortcuts ---
  {
    name: "create_shortcut",
    description: "Create a shortcut (bookmark) to a note, notebook, or tag.",
    inputSchema: {
      type: "object" as const,
      properties: {
        targetId: {
          type: "string",
          description: "ID of the item to create a shortcut to",
        },
        targetType: {
          type: "string",
          enum: ["note", "notebook", "tag", "search"],
          description: "Type of the target item",
        },
      },
      required: ["targetId", "targetType"],
    },
  },
  {
    name: "delete_shortcut",
    description: "Delete a shortcut by its ID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        shortcutId: {
          type: "string",
          description: "ID of the shortcut to delete",
        },
      },
      required: ["shortcutId"],
    },
  },

  // --- Utilities ---
  {
    name: "get_thumbnail_url",
    description: "Get the thumbnail image URL for a note.",
    inputSchema: {
      type: "object" as const,
      properties: {
        noteId: {
          type: "string",
          description: "ID of the note",
        },
      },
      required: ["noteId"],
    },
  },
  {
    name: "rich_link",
    description: "Generate a rich link preview for a URL.",
    inputSchema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "URL to generate a rich preview for",
        },
      },
      required: ["url"],
    },
  },
];

// ─── Content Formatting Helper ─────────────────────────────

function formatContent(content: string, format: string = "text"): string {
  switch (format) {
    case "markdown":
      return markdownToENML(content);
    case "enml":
      return content; // Already ENML
    case "text":
    default:
      return textToENML(content);
  }
}

// ─── Response Helper ───────────────────────────────────────

function formatResponse(result: ApiResponse<unknown>): {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
} {
  if (!result.ok) {
    return {
      content: [{ type: "text", text: `Error: ${result.error}` }],
      isError: true,
    };
  }

  const text =
    result.data !== undefined
      ? typeof result.data === "string"
        ? result.data
        : JSON.stringify(result.data, null, 2)
      : "Success (no content returned)";

  return {
    content: [{ type: "text", text }],
  };
}

// ─── Tool Handler ──────────────────────────────────────────

async function handleToolCall(
  client: EvernoteClient,
  name: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  switch (name) {
    // --- Notes ---
    case "create_note": {
      const result = await client.createNote({
        title: args.title as string,
        content: formatContent(
          args.content as string,
          (args.format as string) || "text"
        ),
        notebookId: args.notebookId as string | undefined,
        tagIds: args.tagIds as string[] | undefined,
      });
      return formatResponse(result);
    }

    case "update_note": {
      const params: Record<string, unknown> = {
        id: args.noteId as string,
      };
      if (args.title !== undefined) params.title = args.title;
      if (args.content !== undefined) {
        params.content = formatContent(
          args.content as string,
          (args.format as string) || "text"
        );
      }
      if (args.tagIds !== undefined) params.tagIds = args.tagIds;
      const result = await client.updateNote(params as any);
      return formatResponse(result);
    }

    case "delete_note": {
      const result = await client.deleteNote(args.noteId as string);
      return formatResponse(result);
    }

    case "export_notes": {
      const result = await client.exportNotes(args.noteIds as string[]);
      return formatResponse(result);
    }

    case "schedule_reminder": {
      const result = await client.scheduleReminder(
        args.noteId as string,
        args.reminderTime as number
      );
      return formatResponse(result);
    }

    // --- Notebooks ---
    case "create_notebook": {
      const result = await client.createNotebook({
        name: args.name as string,
        stack: args.stack as string | undefined,
      });
      return formatResponse(result);
    }

    case "delete_notebook": {
      const result = await client.deleteNotebook(args.notebookId as string);
      return formatResponse(result);
    }

    // --- Tags ---
    case "create_tag": {
      const result = await client.createTag({
        name: args.name as string,
        parentId: args.parentId as string | undefined,
      });
      return formatResponse(result);
    }

    case "update_tag": {
      const result = await client.updateTag(args.tagId as string, {
        name: args.name as string | undefined,
        parentId: args.parentId as string | undefined,
      });
      return formatResponse(result);
    }

    // --- Search ---
    case "search_notes": {
      const result = await client.searchSemantic({
        query: args.query as string,
        maxResults: (args.maxResults as number) || 20,
        timezone: args.timezone as string | undefined,
        keywordFallback: true,
      });
      return formatResponse(result);
    }

    case "ask_notes": {
      const result = await client.semanticAnswer(args.question as string);
      return formatResponse(result);
    }

    case "find_related": {
      const result = await client.relatedNotesOrAnswer(args.query as string);
      return formatResponse(result);
    }

    // --- AI ---
    case "ai_summarize": {
      const result = await client.aiSummarize({
        content: args.content as string,
        style: (args.style as any) || "bullet",
      });
      return formatResponse(result);
    }

    case "ai_rephrase": {
      const result = await client.aiRephrase({
        content: args.content as string,
        style: (args.style as any) || "concise",
      });
      return formatResponse(result);
    }

    case "ai_suggest_tags": {
      const result = await client.aiSuggestTags(args.noteGuid as string);
      return formatResponse(result);
    }

    case "ai_suggest_title": {
      const result = await client.aiSuggestTitle(args.noteGuid as string);
      return formatResponse(result);
    }

    // --- User ---
    case "get_user": {
      const result = await client.getUser();
      return formatResponse(result);
    }

    case "get_usage": {
      const result = await client.getUsage();
      return formatResponse(result);
    }

    // --- Shortcuts ---
    case "create_shortcut": {
      const result = await client.createShortcut({
        targetId: args.targetId as string,
        targetType: args.targetType as any,
      });
      return formatResponse(result);
    }

    case "delete_shortcut": {
      const result = await client.deleteShortcut(args.shortcutId as string);
      return formatResponse(result);
    }

    // --- Utilities ---
    case "get_thumbnail_url": {
      const url = client.getThumbnailUrl(args.noteId as string);
      return { content: [{ type: "text", text: url }] };
    }

    case "rich_link": {
      const result = await client.richLink(args.url as string);
      return formatResponse(result);
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }
}

// ─── Main ──────────────────────────────────────────────────

async function main() {
  const tokenPath = process.env.EVERNOTE_TOKEN_PATH || undefined;

  // 1. Load auth tokens
  const tokens = await loadTokens(tokenPath);

  if (!tokens) {
    console.error(
      "No auth tokens found. Run authentication first:\n\n" +
        "  npx tsx src/mcp-auth.ts\n\n" +
        "This will open your browser to log in via Evernote's OAuth2 flow.\n" +
        "Tokens are saved to ~/.evernote-api/tokens.json"
    );
    process.exit(1);
  }

  // 2. Refresh if needed
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

  // 3. Create client
  const client = new EvernoteClient(activeTokens, tokenPath);

  // 4. Create MCP server
  const server = new Server(
    {
      name: "evernote-mcp-server",
      version: "2.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // 5. Register tool handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      return await handleToolCall(client, name, (args || {}) as Record<string, unknown>);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  // 6. Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr (stdout is reserved for MCP protocol)
  console.error("Evernote MCP Server started (stdio transport)");
  console.error(`Tools available: ${tools.length}`);
  console.error(`User: ${activeTokens.userId} | Shard: ${activeTokens.shard}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
