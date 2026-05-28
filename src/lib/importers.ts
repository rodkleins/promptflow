import { open } from "@tauri-apps/plugin-dialog";
import { readFile, readTextFile } from "@tauri-apps/plugin-fs";
import mammoth from "mammoth";
import { marked } from "marked";

export function plainTextToTiptapJson(text: string): string {
  // Split on one-or-more blank lines (paragraph breaks). Inside each block,
  // collapse stray single newlines into a single space so multi-line wrapped
  // paragraphs stay together as one block.
  const blocks = text
    .split(/\r?\n\s*\r?\n+/)
    .map((block) => block.replace(/\s*\r?\n\s*/g, " ").trim())
    .filter(Boolean);
  const paragraphs = blocks.length
    ? blocks.map((block) => ({
        type: "paragraph",
        content: [{ type: "text", text: block }],
      }))
    : [{ type: "paragraph", content: [] }];
  return JSON.stringify({ type: "doc", content: paragraphs });
}

function htmlToTiptapJson(html: string): string {
  // Quick conversion using the browser DOM. Tiptap can parse HTML directly
  // when we feed it to a temporary editor, but for the import step we just
  // wrap it as an HTML doc node — the Tiptap editor parses HTML on setContent.
  return html;
}

export interface ImportResult {
  title: string;
  /** Either a Tiptap JSON string OR raw HTML (caller must detect with startsWith("{")) */
  content: string;
}

function basename(path: string): string {
  const parts = path.split(/[/\\]/);
  const last = parts[parts.length - 1] ?? "Imported";
  return last.replace(/\.[^.]+$/, "");
}

export async function importTxt(): Promise<ImportResult | null> {
  const path = await open({
    title: "Import TXT",
    multiple: false,
    filters: [{ name: "Text", extensions: ["txt"] }],
  });
  if (!path || typeof path !== "string") return null;
  const text = await readTextFile(path);
  return {
    title: basename(path),
    content: plainTextToTiptapJson(text),
  };
}

export async function importMarkdown(): Promise<ImportResult | null> {
  const path = await open({
    title: "Import Markdown",
    multiple: false,
    filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
  });
  if (!path || typeof path !== "string") return null;
  const text = await readTextFile(path);
  const html = await marked.parse(text, { gfm: true, breaks: false });
  return {
    title: basename(path),
    content: htmlToTiptapJson(html),
  };
}

export async function importDocx(): Promise<ImportResult | null> {
  const path = await open({
    title: "Import DOCX",
    multiple: false,
    filters: [{ name: "Word document", extensions: ["docx"] }],
  });
  if (!path || typeof path !== "string") return null;
  const bytes = await readFile(path);
  const ab = (bytes.buffer as ArrayBuffer).slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  const result = await mammoth.convertToHtml({ arrayBuffer: ab });
  return {
    title: basename(path),
    content: htmlToTiptapJson(result.value),
  };
}
