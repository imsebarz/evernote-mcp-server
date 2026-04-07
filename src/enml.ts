// ============================================================
// ENML (Evernote Markup Language) Helpers
// ENML is a restricted subset of XHTML used for note content.
// DTD: http://xml.evernote.com/pub/enml2.dtd
// ============================================================

const ENML_HEADER = `<?xml version="1.0" encoding="UTF-8"?>`;
const ENML_DOCTYPE = `<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">`;

/**
 * Wrap HTML content in proper ENML envelope.
 *
 * @example
 * ```ts
 * const enml = wrapInENML("<p>Hello <b>World</b></p>");
 * // Returns full ENML document ready for note creation
 * ```
 */
export function wrapInENML(htmlContent: string): string {
  return `${ENML_HEADER}\n${ENML_DOCTYPE}\n<en-note>${htmlContent}</en-note>`;
}

/**
 * Convert plain text to ENML.
 * Handles line breaks, special characters, and basic formatting.
 */
export function textToENML(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const paragraphs = escaped
    .split(/\n\n+/)
    .map((p) => {
      const lines = p.split(/\n/).join("<br/>");
      return `<p>${lines}</p>`;
    })
    .join("\n");

  return wrapInENML(paragraphs);
}

/**
 * Convert Markdown to basic ENML.
 * Supports: headings, bold, italic, code, links, lists, and paragraphs.
 * For complex markdown, consider using a full parser like marked.
 */
export function markdownToENML(markdown: string): string {
  let html = markdown
    // Escape XML special chars first (except markdown syntax)
    .replace(/&/g, "&amp;")

    // Headings
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")

    // Bold & italic
    .replace(/\*\*\*(.+?)\*\*\*/g, "<b><i>$1</i></b>")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\*(.+?)\*/g, "<i>$1</i>")

    // Inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")

    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')

    // Horizontal rule
    .replace(/^---$/gm, "<hr/>")

    // Unordered lists (simple single-level)
    .replace(/^[*-] (.+)$/gm, "<li>$1</li>");

  // Wrap consecutive <li> in <ul>
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>\n$1</ul>\n");

  // Remaining lines → paragraphs
  const lines = html.split("\n");
  const result: string[] = [];
  let inBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      inBlock = false;
      continue;
    }

    // Skip lines that are already block elements
    if (
      trimmed.startsWith("<h") ||
      trimmed.startsWith("<ul") ||
      trimmed.startsWith("</ul") ||
      trimmed.startsWith("<li") ||
      trimmed.startsWith("<hr")
    ) {
      result.push(trimmed);
      inBlock = false;
      continue;
    }

    // Wrap plain text in <p>
    if (!inBlock) {
      result.push(`<p>${trimmed}</p>`);
    } else {
      // Continuation of previous paragraph
      const last = result.length - 1;
      result[last] = result[last].replace("</p>", `<br/>${trimmed}</p>`);
    }
    inBlock = true;
  }

  return wrapInENML(result.join("\n"));
}

/**
 * Extract plain text from ENML content.
 * Strips all XML/HTML tags and decodes entities.
 */
export function enmlToText(enml: string): string {
  return enml
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Create an ENML todo/checklist item.
 */
export function todoItem(text: string, checked = false): string {
  return `<en-todo checked="${checked}"/>${text}<br/>`;
}

/**
 * Create a complete ENML checklist note.
 */
export function checklistToENML(
  items: Array<{ text: string; done?: boolean }>
): string {
  const content = items
    .map((item) => todoItem(item.text, item.done ?? false))
    .join("\n");
  return wrapInENML(`<p>${content}</p>`);
}
