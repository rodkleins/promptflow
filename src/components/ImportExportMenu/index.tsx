import { useEffect, useRef, useState } from "react";
import { createScript } from "../../db/client";
import { exportAsDocx, exportAsTxt } from "../../lib/exporters";
import { importDocx, importTxt } from "../../lib/importers";
import { usePrompter } from "../../store/prompter";

interface Props {
  scriptId: string | null;
  title: string;
  contentJson: string;
}

export function ImportExportMenu({ scriptId, title, contentJson }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const upsertScript = usePrompter((s) => s.upsertScript);
  const setActiveScriptId = usePrompter((s) => s.setActiveScriptId);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function runImport(kind: "txt" | "docx") {
    setOpen(false);
    try {
      const result = kind === "txt" ? await importTxt() : await importDocx();
      if (!result) return;
      const script = await createScript(result.title, null);
      // Replace empty default content with the imported content.
      const { updateScript } = await import("../../db/client");
      await updateScript(script.id, { content: result.content });
      upsertScript({ ...script, content: result.content });
      setActiveScriptId(script.id);
    } catch (e) {
      console.error("import failed", e);
      alert(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function runExport(kind: "txt" | "docx") {
    setOpen(false);
    if (!scriptId) return;
    try {
      if (kind === "txt") await exportAsTxt(title, contentJson);
      else await exportAsDocx(title, contentJson);
    } catch (e) {
      console.error("export failed", e);
      alert(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-300 hover:bg-neutral-800"
      >
        File ▾
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-48 rounded border border-neutral-700 bg-neutral-900 py-1 text-xs shadow-xl">
          <div className="px-3 pt-1 pb-0.5 text-[10px] font-semibold tracking-wider text-neutral-500 uppercase">
            Import
          </div>
          <button
            type="button"
            onClick={() => runImport("txt")}
            className="block w-full px-3 py-1 text-left text-neutral-200 hover:bg-neutral-800"
          >
            From TXT…
          </button>
          <button
            type="button"
            onClick={() => runImport("docx")}
            className="block w-full px-3 py-1 text-left text-neutral-200 hover:bg-neutral-800"
          >
            From DOCX…
          </button>
          <div className="my-1 border-t border-neutral-800" />
          <div className="px-3 pt-1 pb-0.5 text-[10px] font-semibold tracking-wider text-neutral-500 uppercase">
            Export
          </div>
          <button
            type="button"
            onClick={() => runExport("txt")}
            disabled={!scriptId}
            className="block w-full px-3 py-1 text-left text-neutral-200 hover:bg-neutral-800 disabled:text-neutral-600"
          >
            As TXT…
          </button>
          <button
            type="button"
            onClick={() => runExport("docx")}
            disabled={!scriptId}
            className="block w-full px-3 py-1 text-left text-neutral-200 hover:bg-neutral-800 disabled:text-neutral-600"
          >
            As DOCX…
          </button>
        </div>
      )}
    </div>
  );
}
