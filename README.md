# evernote-unofficial-api

Unofficial Evernote API client & MCP server, reverse-engineered from the Evernote Web App (Ion v11.10.1). Full CRUD, semantic search, AI features, and 22 MCP tools for Claude Desktop / Claude Code.

## MCP Server — Quick Start

```bash
# 1. Install
npm install

# 2. Authenticate (opens browser — only needed once)
npx tsx src/mcp-auth.ts

# 3. Start the MCP server
npx tsx src/mcp-server.ts
```

### Claude Desktop Integration

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "evernote": {
      "command": "npx",
      "args": ["tsx", "src/mcp-server.ts"],
      "cwd": "/path/to/evernote-api"
    }
  }
}
```

### Claude Code Integration

```bash
claude mcp add evernote -- npx tsx src/mcp-server.ts
```

### 22 MCP Tools Available

| Category | Tools |
|---|---|
| **Notes** | `create_note`, `update_note`, `delete_note`, `export_notes`, `schedule_reminder` |
| **Notebooks** | `create_notebook`, `delete_notebook` |
| **Tags** | `create_tag`, `update_tag` |
| **Search** | `search_notes` (semantic AI), `ask_notes` (Q&A), `find_related` |
| **AI** | `ai_summarize`, `ai_rephrase`, `ai_suggest_tags`, `ai_suggest_title` |
| **Account** | `get_user`, `get_usage` |
| **Shortcuts** | `create_shortcut`, `delete_shortcut` |
| **Utils** | `get_thumbnail_url`, `rich_link` |

---

## TypeScript API — Quick Start

```bash
# Install dependencies
npm install

# Run the example (opens browser for OAuth2 login)
npx tsx src/example.ts
```

On first run, your browser will open for login via Evernote's official OAuth2 PKCE flow. After authenticating, tokens are cached at `~/.evernote-api/tokens.json` and reused automatically.

## Usage

```typescript
import { authenticate, EvernoteClient, textToENML, markdownToENML } from "./src/index.js";

// Authenticate (opens browser on first run, uses cached tokens after)
const tokens = await authenticate();
const client = new EvernoteClient(tokens);

// Get user info
const user = await client.getUser();

// Create a note from plain text
await client.createNote({
  title: "My Note",
  content: textToENML("Hello from the API!"),
});

// Create a note from Markdown
await client.createNote({
  title: "Meeting Notes",
  content: markdownToENML("# Heading\n\n- Item 1\n- Item 2"),
});

// Semantic (AI) search
const results = await client.searchSemantic({
  query: "meeting notes from last week",
  maxResults: 10,
});

// AI Summarize
const summary = await client.aiSummarize({
  content: "Long text...",
  style: "bullet",  // bullet | email | meeting | paragraph | twitter
});

// AI Rephrase
const rephrased = await client.aiRephrase({
  content: "Make this sound better",
  style: "formal",  // concise | formal | friendly | funny | engaging | empathetic
});

// Export notes
await client.exportNotes(["noteId1", "noteId2"]);

// Raw request to any endpoint
await client.raw("GET", "/v1/some/endpoint", undefined, { param: "value" });
```

## Available Methods

### Notes
- `createNote(params)` — Create a new note
- `updateNote(params)` — Update an existing note
- `deleteNote(noteId)` — Delete (trash) a note
- `exportNotes(noteIds)` — Export notes
- `requestNoteAccess(noteId)` — Request access to a shared note
- `scheduleReminder(noteId, time)` — Schedule a reminder

### Notebooks
- `createNotebook(params)` — Create a notebook
- `deleteNotebook(notebookId)` — Delete a notebook

### Tags
- `createTag(params)` — Create a tag
- `updateTag(tagId, params)` — Update a tag

### Search
- `searchSemantic(params)` — AI-powered semantic search
- `semanticAnswer(query)` — Get AI answer from your notes
- `relatedNotesOrAnswer(query)` — Related notes or AI answer

### AI Features
- `aiSummarize(params)` — Summarize text
- `aiRephrase(params)` — Rephrase text
- `aiSuggestTags(noteGuid)` — Get tag suggestions for a note
- `aiSuggestTitle(noteGuid)` — Get title suggestion for a note
- `aiCopilot(prompt)` — AI copilot interaction
- `aiDetectText(content)` — Detect AI-generated text

### User & Account
- `getUser()` — Get current user profile
- `getUsage()` — Get usage statistics
- `getDevices()` — List connected devices
- `getBilling()` — Get billing info
- `getPayments()` — Get payment history

### Shortcuts
- `createShortcut(shortcut)` — Create a shortcut
- `updateShortcut(id, update)` — Update a shortcut
- `deleteShortcut(id)` — Delete a shortcut

### Utilities
- `richLink(url)` — Generate rich link preview
- `ocrBusinessCard(imageData)` — OCR a business card
- `getThumbnailUrl(noteId)` — Get note thumbnail URL
- `getUserPhotoUrl(size)` — Get user photo URL

## ENML Helpers

```typescript
import { textToENML, markdownToENML, wrapInENML, checklistToENML, enmlToText } from "./src/index.js";

// Plain text → ENML
textToENML("Hello\n\nWorld");

// Markdown → ENML
markdownToENML("# Title\n\n**Bold** and *italic*");

// Raw HTML → ENML
wrapInENML("<p>Custom <b>HTML</b></p>");

// Checklist → ENML
checklistToENML([
  { text: "Buy groceries", done: true },
  { text: "Clean house", done: false },
]);

// ENML → plain text
enmlToText("<en-note><p>Hello</p></en-note>");
```

## Architecture

```
Your Code → EvernoteClient → api.evernote.com (REST /v1/*)
                           → api.evernote.com/command (NSync mutations)
                           → www.evernote.com/shard/{s}/notestore (Thrift, advanced)
```

Auth tokens are obtained via OAuth2 PKCE against `accounts.evernote.com` — the same flow the official web client uses.

## Disclaimer

This is an unofficial client based on reverse engineering the Evernote web application. It is not affiliated with, endorsed by, or supported by Evernote Corporation. Use at your own risk. The internal API may change without notice.
