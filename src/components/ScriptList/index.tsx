import { useMemo, useState } from "react";
import {
  createFolder,
  createScript,
  deleteFolder,
  deleteScript,
} from "../../db/client";
import { usePrompter } from "../../store/prompter";
import type { Folder, Script } from "../../types";

const UNFILED = "__unfiled__";

export function ScriptList() {
  const scripts = usePrompter((s) => s.scripts);
  const folders = usePrompter((s) => s.folders);
  const activeScriptId = usePrompter((s) => s.activeScriptId);
  const setActiveScriptId = usePrompter((s) => s.setActiveScriptId);
  const upsertScript = usePrompter((s) => s.upsertScript);
  const removeScript = usePrompter((s) => s.removeScript);
  const upsertFolder = usePrompter((s) => s.upsertFolder);
  const removeFolder = usePrompter((s) => s.removeFolder);

  const [search, setSearch] = useState("");
  const [newFolderName, setNewFolderName] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scripts;
    return scripts.filter((s) => s.title.toLowerCase().includes(q));
  }, [scripts, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, Script[]>();
    map.set(UNFILED, []);
    for (const f of folders) map.set(f.id, []);
    for (const s of filtered) {
      const key = s.folder_id ?? UNFILED;
      if (!map.has(key)) map.set(UNFILED, [...(map.get(UNFILED) ?? []), s]);
      else map.get(key)!.push(s);
    }
    return map;
  }, [filtered, folders]);

  async function handleNewScript(folderId: string | null = null) {
    const script = await createScript("Untitled script", folderId);
    upsertScript(script);
    setActiveScriptId(script.id);
    // Auto-focus + select the title input rendered in EditorPage
    setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>("[data-script-title-input]");
      if (el) {
        el.focus();
        el.select();
      }
    }, 50);
  }

  async function commitNewFolder() {
    const name = newFolderName?.trim();
    setNewFolderName(null);
    if (!name) return;
    const folder = await createFolder(name);
    upsertFolder(folder);
  }

  async function handleDeleteScript(s: Script) {
    if (!confirm(`Delete "${s.title}"?`)) return;
    await deleteScript(s.id);
    removeScript(s.id);
  }

  async function handleDeleteFolder(f: Folder) {
    if (!confirm(`Delete folder "${f.name}"? Scripts inside become unfiled.`)) return;
    await deleteFolder(f.id);
    removeFolder(f.id);
  }

  const renderScript = (s: Script) => (
    <div
      key={s.id}
      className={`group flex items-center rounded ${
        activeScriptId === s.id ? "bg-indigo-600/40" : "hover:bg-neutral-800"
      }`}
    >
      <button
        type="button"
        onClick={() => setActiveScriptId(s.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          handleDeleteScript(s);
        }}
        className={`flex-1 truncate px-2 py-1 text-left text-sm ${
          activeScriptId === s.id ? "text-white" : "text-neutral-300"
        }`}
      >
        {s.title}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleDeleteScript(s);
        }}
        title="Delete script"
        className="mr-1 hidden h-6 w-6 items-center justify-center rounded text-neutral-500 group-hover:flex hover:bg-red-900/40 hover:text-red-400"
      >
        ×
      </button>
    </div>
  );

  return (
    <aside className="flex h-full w-64 flex-col border-r border-neutral-800 bg-neutral-900">
      <div className="border-b border-neutral-800 px-3 pt-3 pb-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-wide text-neutral-400 uppercase">
            Scripts
          </h2>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => handleNewScript(null)}
              className="rounded bg-indigo-600 px-2 py-0.5 text-xs text-white hover:bg-indigo-500"
              title="New script"
            >
              + Script
            </button>
            <button
              type="button"
              onClick={() => setNewFolderName("")}
              className="rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-300 hover:bg-neutral-800"
              title="New folder"
            >
              + Folder
            </button>
          </div>
        </div>
        <input
          type="text"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mt-2 w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-sm text-neutral-200 placeholder-neutral-600 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {newFolderName != null && (
          <input
            autoFocus
            value={newFolderName}
            placeholder="Folder name…"
            onChange={(e) => setNewFolderName(e.target.value)}
            onBlur={commitNewFolder}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitNewFolder();
              if (e.key === "Escape") setNewFolderName(null);
            }}
            className="mb-2 w-full rounded border border-indigo-500 bg-neutral-900 px-2 py-1 text-sm text-neutral-200 focus:outline-none"
          />
        )}

        {folders.map((f) => {
          const items = grouped.get(f.id) ?? [];
          return (
            <div key={f.id} className="mb-2">
              <div className="flex items-center justify-between px-1 py-1">
                <span className="text-xs font-semibold text-neutral-500">
                  {f.name}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => handleNewScript(f.id)}
                    className="text-xs text-neutral-500 hover:text-neutral-200"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteFolder(f)}
                    className="text-xs text-neutral-500 hover:text-red-400"
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="space-y-0.5">{items.map(renderScript)}</div>
            </div>
          );
        })}

        <div className="mb-2">
          {folders.length > 0 && (
            <div className="px-1 py-1 text-xs font-semibold text-neutral-500">
              Unfiled
            </div>
          )}
          <div className="space-y-0.5">
            {(grouped.get(UNFILED) ?? []).map(renderScript)}
          </div>
        </div>

        {scripts.length === 0 && (
          <button
            type="button"
            onClick={() => handleNewScript(null)}
            className="mt-6 block w-full rounded-lg border border-dashed border-neutral-700 px-4 py-6 text-center text-sm text-neutral-500 hover:border-indigo-500 hover:text-neutral-200"
          >
            <div className="text-2xl">＋</div>
            <div className="mt-1">Create your first script</div>
          </button>
        )}
      </div>
    </aside>
  );
}
