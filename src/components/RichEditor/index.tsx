import { type Content, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";

export interface RichEditorChange {
  json: string;
  wordCount: number;
  cursorOffset: number;
  docSize: number;
}

interface Props {
  scriptId: string;
  initialContent: string;
  onChange: (change: RichEditorChange) => void;
}

function parseInitial(content: string): Content {
  const trimmed = content.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === "object" && (parsed as { type?: string }).type === "doc") {
        return parsed as Content;
      }
    } catch {
      /* fall through */
    }
  }
  // Treat anything else as raw HTML (Tiptap parses it on setContent)
  if (trimmed.startsWith("<")) return trimmed;
  return { type: "doc", content: [{ type: "paragraph" }] };
}

export function RichEditor({ scriptId, initialContent, onChange }: Props) {
  const editor = useEditor(
    {
      extensions: [StarterKit],
      content: parseInitial(initialContent),
      editorProps: {
        attributes: {
          class:
            "block-editor prose prose-invert max-w-none min-h-full px-12 py-6 focus:outline-none text-neutral-100",
        },
        transformPastedText: (text) => {
          // Split on blank lines → paragraphs; collapse stray newlines within a block to a space.
          const blocks = text
            .split(/\r?\n\s*\r?\n+/)
            .map((b) => b.replace(/\s*\r?\n\s*/g, " ").trim())
            .filter(Boolean);
          return blocks.length > 1 ? blocks.join("\n\n") : text;
        },
      },
      onUpdate: ({ editor }) => {
        const json = JSON.stringify(editor.getJSON());
        const wordCount = editor.getText().trim().split(/\s+/).filter(Boolean).length;
        const cursorOffset = editor.state.selection.from;
        const docSize = editor.state.doc.content.size;
        onChange({ json, wordCount, cursorOffset, docSize });
      },
      onSelectionUpdate: ({ editor }) => {
        const json = JSON.stringify(editor.getJSON());
        const wordCount = editor.getText().trim().split(/\s+/).filter(Boolean).length;
        const cursorOffset = editor.state.selection.from;
        const docSize = editor.state.doc.content.size;
        onChange({ json, wordCount, cursorOffset, docSize });
      },
    },
    [scriptId],
  );

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const next = parseInitial(initialContent);
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(next)) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [editor, initialContent]);

  if (!editor) return null;

  const btn = (active: boolean) =>
    `rounded px-2 py-1 text-xs ${
      active
        ? "bg-indigo-600 text-white"
        : "text-neutral-300 hover:bg-neutral-800"
    }`;

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-1 border-b border-neutral-800 px-4 py-2">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={btn(editor.isActive("bold"))}
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={btn(editor.isActive("italic"))}
        >
          <em>I</em>
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={btn(editor.isActive("heading", { level: 1 }))}
        >
          H1
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={btn(editor.isActive("heading", { level: 2 }))}
        >
          H2
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={btn(editor.isActive("bulletList"))}
        >
          • List
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <EditorContent editor={editor} className="h-full" />
      </div>
    </div>
  );
}
