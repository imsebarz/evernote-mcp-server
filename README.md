# evernote-unofficial-api

Unofficial Evernote API client & MCP server, reverse-engineered from Evernote's web and desktop clients. Full CRUD, attachments, semantic search, AI features, resource OCR, and 31 MCP tools for Claude Desktop / Claude Code.

## License

This public repository is licensed under the MIT License. See [LICENSE](LICENSE).

## MCP Server — Quick Start

```bash
# 1. Install and initialize optional private data
./setup-repo.sh

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

### Codex CLI Integration

Run the setup commands from this repository after installing dependencies and authenticating.

```bash
codex mcp add evernote -- npx tsx src/mcp-server.ts
codex mcp list
```

For a persistent config entry, add this to `~/.codex/config.toml`:

```toml
[mcp_servers.evernote]
command = "npx"
args = ["tsx", "src/mcp-server.ts"]
cwd = "/path/to/evernote-mcp-server"
```

Use the absolute path to this repository for `cwd` if you start Codex from another directory.

### GitHub CLI Integration

GitHub's MCP-capable command-line client is GitHub Copilot CLI. If you use it through GitHub CLI, run it with `gh copilot`.

```bash
# Standalone Copilot CLI
copilot mcp add evernote --type stdio --tools '*' -- npx tsx src/mcp-server.ts
copilot mcp list

# Via GitHub CLI
gh copilot -- mcp add evernote --type stdio --tools '*' -- npx tsx src/mcp-server.ts
```

Or add this persistent entry to `~/.copilot/mcp-config.json`:

```json
{
  "mcpServers": {
    "evernote": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "src/mcp-server.ts"],
      "cwd": "/path/to/evernote-mcp-server",
      "env": {},
      "tools": ["*"]
    }
  }
}
```

Use the absolute path to this repository for `cwd` if you start Copilot from another directory.

## Private Directory

`private/` is a Git submodule backed by the private `jonmlevine/evernote-mcp-private` repository. It stores private ScanSnap classification artifacts and is optional for public users; the MCP server can build and run without it.

Authorized users can initialize it during setup:

```bash
./setup-repo.sh
```

Or initialize only the submodule:

```bash
git submodule update --init --recursive private
```

Fresh authorized clones can include it immediately:

```bash
git clone --recurse-submodules https://github.com/jonmlevine/evernote-mcp-server.git
```

If the submodule checkout is denied, authenticate GitHub CLI with an account that can read the private repository, then retry:

```bash
gh auth login
git submodule update --init --recursive private
```

Private ScanSnap files belong under `private/`:

- `private/SCANSNAP_CLASSIFICATION_PATTERNS.md`
- `private/scansnap-title-tag-suggestions.csv`
- `private/scansnap-title-tag-suggestions.md`
- `private/scansnap-evernote-update-results.json`

Do not copy these files to the public repository root. Root-level copies are ignored by `.gitignore` to reduce accidental commits.

### 31 MCP Tools Available

| Category | Tools |
|---|---|
| **Notes** | `create_note`, `update_note`, `delete_note`, `get_note`, `export_notes`, `schedule_reminder` |
| **Attachments** | `list_attachments`, `add_attachment`, `get_attachment` |
| **Notebooks** | `list_notebooks`, `get_notebook`, `create_notebook`, `delete_notebook` |
| **Tags** | `list_tags`, `create_tag`, `update_tag` |
| **Search** | `search_notes` (semantic AI), `ask_notes` (Q&A), `find_related` |
| **AI** | `ai_summarize`, `ai_rephrase`, `ai_suggest_tags`, `ai_suggest_title` |
| **OCR** | `get_note_ocr`, `get_resource_ocr` |
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

// Add a PDF, Word, PowerPoint, Excel, image, or other file attachment
await client.addAttachment({
  noteId: "noteGuid",
  filename: "quarterly-report.xlsx",
  data: fileBuffer, // Buffer/Uint8Array, or base64 string with dataEncoding: "base64"
});

// List and retrieve attachments. Retrieved binary data is base64 encoded.
const attachments = await client.listAttachments("noteGuid");
const attachment = await client.getAttachment("resourceGuid");

// Get OCR/recognition content for resources attached to a note
const noteOcr = await client.getNoteOcrContents("noteGuid");

// Get OCR/search text for one resource. Passing the parent note ID avoids
// an extra NoteStore lookup; omit it if you only have the resource ID.
const resourceOcr = await client.getResourceOcrContents("resourceGuid", {
  noteId: "parentNoteGuid",
});

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
- `listAttachments(noteId)` — List metadata for all attachments/resources on a note
- `addAttachment(params)` — Add a binary attachment to a note
- `getAttachment(resourceId, options?)` — Retrieve attachment metadata and optional base64 data
- `getNoteOcrContents(noteId, options?)` — Get OCR/recognition content for all resources attached to a note
- `getResourceOcrContents(resourceId, options?)` — Get OCR/recognition content and search text for one resource
- `getThumbnailUrl(noteId)` — Get note thumbnail URL
- `getUserPhotoUrl(size)` — Get user photo URL

## REST API

Start the REST API server with:

```bash
npm run api
```

By default it listens on `http://localhost:8080`. If `MCP_PROXY_API_KEY` is set, pass it as `X-API-Key`.

### Attachments

Attachments are stored as Evernote resources and inserted into the note body with an ENML `<en-media>` tag. MIME type can be passed explicitly or inferred from common file extensions, including PDF, Word (`.doc`, `.docx`), PowerPoint (`.ppt`, `.pptx`), Excel (`.xls`, `.xlsx`), images, text, CSV, RTF, ZIP, and unknown binary files.

#### List attachments on a note

```http
GET /api/notes/:noteId/attachments
```

Response shape:

```json
[
  {
    "id": "resource-guid",
    "noteId": "note-guid",
    "mime": "application/pdf",
    "filename": "scan.pdf",
    "size": 12345,
    "hash": "md5-resource-hash"
  }
]
```

#### Add an attachment to a note

```http
POST /api/notes/:noteId/attachments
Content-Type: application/json

{
  "filename": "quarterly-report.xlsx",
  "mime": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "data": "BASE64_ENCODED_BYTES",
  "dataEncoding": "base64"
}
```

`mime` is optional when the filename extension is recognized. `dataEncoding` defaults to `base64`; use `utf8` only for plain text payloads.

#### Retrieve an attachment

```http
GET /api/resources/:resourceId
GET /api/resources/:resourceId?includeData=false
```

Response shape:

```json
{
  "id": "resource-guid",
  "noteId": "note-guid",
  "mime": "application/pdf",
  "filename": "scan.pdf",
  "size": 12345,
  "hash": "md5-resource-hash",
  "data": "BASE64_ENCODED_BYTES",
  "encoding": "base64"
}
```

Use `includeData=false` when you only need metadata.

### OCR / Recognition

These routes use Evernote's Quasar Query backend (`https://api.evernote.com/query/v1/graphql`), the same backend used by newer Evernote desktop clients for resource recognition and search text.

#### Get OCR contents for a note

```http
GET /api/notes/:noteId/ocr
GET /api/notes/:noteId/ocr?includeSearchText=false
```

Response shape:

```json
{
  "noteId": "note-guid",
  "resources": [
    {
      "id": "resource-guid",
      "dataHash": "resource-data-hash",
      "recognition": {
        "content": "<recoIndex>...</recoIndex>",
        "size": 1234,
        "hash": "recognition-hash"
      },
      "searchText": "plain searchable OCR text"
    }
  ]
}
```

`includeSearchText` defaults to `true`. The `recognition.content` value is Evernote's recognition XML; `searchText` is the backend's extracted searchable text when available.

#### Get OCR contents for one resource

```http
GET /api/resources/:resourceId/ocr
GET /api/resources/:resourceId/ocr?noteId=:parentNoteId
```

Response shape:

```json
{
  "resourceId": "resource-guid",
  "noteId": "parent-note-guid",
  "recognition": {
    "content": "<recoIndex>...</recoIndex>"
  },
  "searchText": "plain searchable OCR text"
}
```

Passing `noteId` is recommended when you already know the parent note. If omitted, the client looks up the resource metadata through NoteStore before calling Quasar, because the backend requires parent note metadata for resource OCR.

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
                           → api.evernote.com/query (Quasar GraphQL OCR)
                           → api.evernote.com/command (NSync mutations)
                           → www.evernote.com/shard/{s}/notestore (Thrift, advanced)
```

Auth tokens are obtained via OAuth2 PKCE against `accounts.evernote.com` — the same flow the official web client uses.

## Testing

```bash
npm test
```

Live OCR backend checks are skipped unless you provide a note/resource pair:

```bash
EVERNOTE_LIVE_OCR_NOTE_ID=note-guid \
EVERNOTE_LIVE_OCR_RESOURCE_ID=resource-guid \
npm test
```

Use a resource that belongs to the note ID. The resource-level Quasar OCR route requires the parent note metadata.

---

## Production / Dokploy (Docker)

> **Important:** This MCP server uses **stdio transport**. To use it remotely, your agents must run on the same host/container or you must add a proxy layer (e.g., mcp‑proxy / stdio bridge). If your agents already run in the VPS, you can deploy this container and point them to the command inside it.

### 1) Build the image
```bash
docker build -t evernote-mcp-server:latest .
```

### 2) Prepare tokens (one‑time)
You need a valid token file. Run auth **once** on a machine with a browser:
```bash
# Option A: locally (recommended)
EVERNOTE_TOKEN_PATH=./tokens.json npx tsx src/mcp-auth.ts

# Then upload tokens.json to the server
```

Or run inside a container and mount `/data`:
```bash
docker run --rm -it -v $PWD/data:/data -e EVERNOTE_TOKEN_PATH=/data/tokens.json evernote-mcp-server:latest node dist/mcp-auth.js
```

### 3) Run in production
```bash
docker run -d \
  --name evernote-mcp-server \
  -e EVERNOTE_TOKEN_PATH=/data/tokens.json \
  -v /opt/evernote-mcp:/data \
  evernote-mcp-server:latest
```

### Dokploy settings (suggested)
- **Image**: `evernote-mcp-server:latest`
- **Env**: `EVERNOTE_TOKEN_PATH=/data/tokens.json`
- **Volume**: `/opt/evernote-mcp:/data`
- **Port**: none (stdio server)

---

## MCP Proxy (stdio → HTTP/SSE)

If you need **remote access** (HTTP/SSE), use the proxy. This exposes the stdio MCP server over HTTP.

### Local run
```bash
# Build first
npm run build

# Run proxy (both SSE + streamable HTTP)
npm run proxy

# Or explicitly choose SSE / stream
npm run proxy:sse
npm run proxy:stream
```

### Docker (proxy)
Build with the proxy Dockerfile:
```bash
docker build -f Dockerfile.proxy -t evernote-mcp-proxy:latest .
```

Run:
```bash
docker run -d \
  --name evernote-mcp-proxy \
  -e EVERNOTE_TOKEN_PATH=/data/tokens.json \
  -e MCP_PROXY_PORT=8080 \
  -e MCP_PROXY_API_KEY=YOUR_SECRET \
  -v /opt/evernote-mcp:/data \
  -p 8080:8080 \
  evernote-mcp-proxy:latest
```

### Dokploy (proxy) settings
- **Dockerfile:** `Dockerfile.proxy`
- **Env:**
  - `EVERNOTE_TOKEN_PATH=/data/tokens.json`
  - `MCP_PROXY_PORT=8080`
  - `MCP_PROXY_API_KEY=...` (recommended)
- **Volume:** `/opt/evernote-mcp:/data`
- **Port:** `8080`

---

## Disclaimer

This is an unofficial client based on reverse engineering the Evernote web application. It is not affiliated with, endorsed by, or supported by Evernote Corporation. Use at your own risk. The internal API may change without notice.
