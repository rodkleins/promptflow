interface TextNode {
  type: "text";
  text: string;
  marks?: unknown[];
}
interface HardBreakNode {
  type: "hardBreak";
}
type InlineNode = TextNode | HardBreakNode | { type: string; [k: string]: unknown };
interface BlockNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: InlineNode[];
}
interface DocNode {
  type: "doc";
  content?: BlockNode[];
}

function hasMarks(content: InlineNode[] | undefined): boolean {
  return !!content?.some(
    (n) =>
      n.type === "text" &&
      Array.isArray((n as TextNode).marks) &&
      ((n as TextNode).marks?.length ?? 0) > 0,
  );
}

function flatten(content: InlineNode[] | undefined): string {
  if (!content) return "";
  return content
    .map((n) => {
      if (n.type === "text") return (n as TextNode).text;
      if (n.type === "hardBreak") return "\n";
      return "";
    })
    .join("");
}

/**
 * Split paragraph nodes that contain embedded blank-line groups into multiple
 * paragraph nodes — matching the block-editor convention.
 *
 * Skips paragraphs with inline marks (bold, italic, etc.) to avoid losing formatting.
 *
 * Returns the new JSON string, or the original if nothing changed.
 */
export function normalizeBlocks(json: string): string {
  let doc: DocNode;
  try {
    doc = JSON.parse(json);
  } catch {
    return json;
  }
  if (doc.type !== "doc" || !Array.isArray(doc.content)) return json;

  const newContent: BlockNode[] = [];
  let changed = false;

  for (const node of doc.content) {
    if (node.type === "paragraph" && Array.isArray(node.content)) {
      const flat = flatten(node.content);
      if (/\n\s*\n/.test(flat) && !hasMarks(node.content)) {
        const blocks = flat
          .split(/\n\s*\n+/)
          .map((b) => b.replace(/\n/g, " ").trim())
          .filter(Boolean);
        if (blocks.length > 1) {
          for (const b of blocks) {
            newContent.push({
              type: "paragraph",
              content: [{ type: "text", text: b }],
            });
          }
          changed = true;
          continue;
        }
      }
    }
    newContent.push(node);
  }

  if (!changed) return json;
  return JSON.stringify({ ...doc, content: newContent });
}
