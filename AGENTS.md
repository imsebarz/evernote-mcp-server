# Repository Guidelines

## Project Structure & Module Organization

This is a TypeScript Evernote client and MCP server. Source files live in `src/`; the main exports are in `src/index.ts`, MCP entrypoints are `src/mcp-server.ts` and `src/mcp-auth.ts`, and HTTP/proxy support lives in `src/api-server.ts` and `src/route-handlers.ts`. Vendored Evernote Thrift stubs are in `vendor/evernote-thrift/`; treat these as generated third-party code unless intentionally refreshing the vendor copy. Build output goes to `dist/` and should not be edited directly.

## Build, Test, and Development Commands

- `npm install`: install dependencies.
- `npm run build`: compile TypeScript with strict settings into `dist/`.
- `npm run auth` or `npm run mcp:auth`: run the one-time Evernote OAuth flow.
- `npm run mcp`: start the local stdio MCP server from TypeScript.
- `npm run dev`: run the TypeScript API example.
- `npm run proxy`, `npm run proxy:sse`, `npm run proxy:stream`: run the built MCP proxy after `npm run build`.

There is currently no `npm test` script.

## Coding Style & Naming Conventions

Use ES modules and explicit `.js` extensions in TypeScript imports, matching the existing code. Keep `strict` TypeScript clean. Use two-space indentation, named exports, and descriptive camelCase for functions and variables. Prefer small modules with focused responsibilities: auth in `auth.ts`, API client behavior in `client.ts`, ENML conversion in `enml.ts`, and MCP tool wiring in `mcp-server.ts` or route handlers.

## Testing Guidelines

For now, validate changes with `npm run build`. For behavior that touches Evernote auth or live API calls, use `src/test-flow.ts` or the relevant example flow manually, and document what account state or token file was used. Name any future tests after the module or behavior under test, for example `enml.test.ts` or `mcp-server.tools.test.ts`.

## Commit & Pull Request Guidelines

Recent history uses short imperative subjects, sometimes with Conventional Commit prefixes such as `feat:`, `fix:`, `refactor:`, and `chore:`. Follow that style: `fix: refresh expired auth tokens` or `Add Codex MCP setup docs`. Pull requests should include a concise summary, commands run, any manual Evernote validation performed, and linked issues when applicable.

## Security & Configuration Tips

Never commit token files. OAuth tokens default to `~/.evernote-api/tokens.json`; production examples use `EVERNOTE_TOKEN_PATH`. Keep secrets in environment variables or mounted volumes, not source files.


