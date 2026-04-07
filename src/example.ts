#!/usr/bin/env tsx
// ============================================================
// Example: Using the Evernote Unofficial API
// Run: npx tsx src/example.ts
// ============================================================

import { authenticate, EvernoteClient, textToENML, markdownToENML } from "./index.js";

async function main() {
  // ─── Step 1: Authenticate ────────────────────────────────
  // First run will open your browser to log in via Evernote's
  // official OAuth2 PKCE flow. Subsequent runs use cached tokens.

  console.log("🔐 Authenticating with Evernote...\n");

  const tokens = await authenticate({
    port: 10500, // local callback server port
    // tokenPath: '~/.evernote-api/tokens.json'  // default
  });

  const client = new EvernoteClient(tokens);

  // ─── Step 2: Get user info ───────────────────────────────

  console.log("\n👤 Fetching user info...");
  const user = await client.getUser();
  if (user.ok) {
    console.log("   User:", JSON.stringify(user.data, null, 2));
  } else {
    console.error("   Error:", user.error);
  }

  // ─── Step 3: Create a note ───────────────────────────────

  console.log("\n📝 Creating a note...");
  const note = await client.createNote({
    title: "My API-Created Note",
    content: textToENML(
      "This note was created programmatically using the Evernote Unofficial API!\n\n" +
        "It supports:\n" +
        "- Full CRUD operations\n" +
        "- Semantic search\n" +
        "- AI features\n" +
        "- And much more!"
    ),
  });

  if (note.ok) {
    console.log("   Created note:", JSON.stringify(note.data, null, 2));
  } else {
    console.error("   Error:", note.error);
  }

  // ─── Step 4: Create a markdown note ──────────────────────

  console.log("\n📋 Creating a markdown note...");
  const mdNote = await client.createNote({
    title: "Meeting Notes — April 2026",
    content: markdownToENML(`
# Meeting Notes

## Attendees
**John**, **Jane**, and **Bob**

## Action Items
- Review Q1 metrics
- Prepare roadmap presentation
- Schedule follow-up for next week

## Key Decisions
We agreed to *prioritize* the new feature rollout over bug fixes.

---

*Notes taken via Evernote Unofficial API*
    `.trim()),
  });

  if (mdNote.ok) {
    console.log("   Created markdown note:", JSON.stringify(mdNote.data, null, 2));
  } else {
    console.error("   Error:", mdNote.error);
  }

  // ─── Step 5: Semantic search ─────────────────────────────

  console.log("\n🔍 Searching notes...");
  const results = await client.searchSemantic({
    query: "meeting notes from this week",
    maxResults: 5,
  });

  if (results.ok) {
    console.log("   Search results:", JSON.stringify(results.data, null, 2));
  } else {
    console.error("   Error:", results.error);
  }

  // ─── Step 6: AI Summarize ────────────────────────────────

  console.log("\n🤖 AI Summarize...");
  const summary = await client.aiSummarize({
    content:
      "The quarterly review showed a 15% increase in user engagement across all platforms. " +
      "Mobile usage grew by 23% while desktop remained steady. The new onboarding flow " +
      "reduced churn by 8% and increased trial-to-paid conversions by 12%. Key challenges " +
      "include scaling the infrastructure for the holiday season and addressing the backlog " +
      "of feature requests from enterprise customers.",
    style: "bullet",
  });

  if (summary.ok) {
    console.log("   Summary:", JSON.stringify(summary.data, null, 2));
  } else {
    console.error("   Error:", summary.error);
  }

  // ─── Step 7: Usage info ──────────────────────────────────

  console.log("\n📊 Getting usage stats...");
  const usage = await client.getUsage();
  if (usage.ok) {
    console.log("   Usage:", JSON.stringify(usage.data, null, 2));
  } else {
    console.error("   Error:", usage.error);
  }

  // ─── Step 8: Export notes ────────────────────────────────

  console.log("\n📦 Exporting notes...");
  if (note.ok && note.data?.id) {
    const exported = await client.exportNotes([note.data.id]);
    if (exported.ok) {
      console.log("   Export:", JSON.stringify(exported.data, null, 2));
    } else {
      console.error("   Error:", exported.error);
    }
  }

  // ─── Done ────────────────────────────────────────────────

  console.log("\n✅ All done! Your tokens are cached at ~/.evernote-api/tokens.json");
  console.log("   Subsequent runs will re-use them automatically.\n");
}

main().catch(console.error);
