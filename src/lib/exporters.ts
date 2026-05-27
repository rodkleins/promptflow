import { save } from "@tauri-apps/plugin-dialog";
import { writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

interface TiptapMark {
  type: string;
}
interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  text?: string;
  marks?: TiptapMark[];
}

function nodeToPlainText(node: TiptapNode): string {
  if (node.type === "text") return node.text ?? "";
  const inner = (node.content ?? []).map(nodeToPlainText).join("");
  if (node.type === "paragraph" || node.type === "heading") return inner + "\n";
  if (node.type === "hardBreak") return "\n";
  return inner;
}

export function tiptapJsonToPlainText(json: string): string {
  try {
    const doc = JSON.parse(json) as TiptapNode;
    return nodeToPlainText(doc).trimEnd();
  } catch {
    return "";
  }
}

function runsFromInlineNodes(nodes: TiptapNode[] | undefined): TextRun[] {
  if (!nodes) return [];
  const runs: TextRun[] = [];
  for (const n of nodes) {
    if (n.type !== "text") continue;
    const marks = n.marks ?? [];
    runs.push(
      new TextRun({
        text: n.text ?? "",
        bold: marks.some((m) => m.type === "bold"),
        italics: marks.some((m) => m.type === "italic"),
      }),
    );
  }
  return runs;
}

function tiptapJsonToDocxParagraphs(json: string): Paragraph[] {
  let doc: TiptapNode;
  try {
    doc = JSON.parse(json);
  } catch {
    return [new Paragraph("")];
  }
  const paragraphs: Paragraph[] = [];
  for (const node of doc.content ?? []) {
    if (node.type === "paragraph") {
      paragraphs.push(new Paragraph({ children: runsFromInlineNodes(node.content) }));
    } else if (node.type === "heading") {
      const level = Number(node.attrs?.level) || 1;
      const headingLevel =
        level === 1
          ? HeadingLevel.HEADING_1
          : level === 2
            ? HeadingLevel.HEADING_2
            : HeadingLevel.HEADING_3;
      paragraphs.push(
        new Paragraph({
          heading: headingLevel,
          children: runsFromInlineNodes(node.content),
        }),
      );
    } else if (node.type === "bulletList" || node.type === "orderedList") {
      for (const item of node.content ?? []) {
        for (const child of item.content ?? []) {
          paragraphs.push(
            new Paragraph({
              bullet: { level: 0 },
              children: runsFromInlineNodes(child.content),
            }),
          );
        }
      }
    }
  }
  if (paragraphs.length === 0) paragraphs.push(new Paragraph(""));
  return paragraphs;
}

export async function exportAsTxt(title: string, contentJson: string): Promise<void> {
  const path = await save({
    title: "Export script as TXT",
    defaultPath: `${title}.txt`,
    filters: [{ name: "Text", extensions: ["txt"] }],
  });
  if (!path) return;
  await writeTextFile(path, tiptapJsonToPlainText(contentJson));
}

export async function exportAsDocx(title: string, contentJson: string): Promise<void> {
  const path = await save({
    title: "Export script as DOCX",
    defaultPath: `${title}.docx`,
    filters: [{ name: "Word document", extensions: ["docx"] }],
  });
  if (!path) return;
  const doc = new Document({
    sections: [{ children: tiptapJsonToDocxParagraphs(contentJson) }],
  });
  const blob = await Packer.toBlob(doc);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await writeFile(path, bytes);
}
