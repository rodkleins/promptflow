import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import { Bookmarks } from "../../components/Bookmarks";
import { ControlBar } from "../../components/ControlBar";
import { ImportExportMenu } from "../../components/ImportExportMenu";
import { RichEditor, type RichEditorChange } from "../../components/RichEditor";
import { ScriptList } from "../../components/ScriptList";
import { SettingsPanel } from "../../components/SettingsPanel";
import { updateScript } from "../../db/client";
import { useAutosave } from "../../hooks/useAutosave";
import { useSettings } from "../../hooks/useSettings";
import { useShortcuts } from "../../hooks/useShortcuts";
import { useVoicePacing } from "../../hooks/useVoicePacing";
import { normalizeBlocks } from "../../lib/normalizeBlocks";
import { usePrompter } from "../../store/prompter";

interface Draft {
  title: string;
  content: string;
  wordCount: number;
}

export function EditorPage() {
  const activeScriptId = usePrompter((s) => s.activeScriptId);
  const script = usePrompter((s) =>
    s.scripts.find((x) => x.id === s.activeScriptId) ?? null,
  );
  const patchActiveScript = usePrompter((s) => s.patchActiveScript);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const cursorOffsetRef = useRef(0);
  const docLengthRef = useRef(1);

  useSettings();
  useShortcuts();
  useVoicePacing();

  // Reflect the prompter's currently-read chapter on the matching paragraph
  // card in the script list (block-editor children).
  useEffect(() => {
    const promise = listen<{ index: number }>("prompter:chapter", (e) => {
      document
        .querySelectorAll(".block-editor > .chapter-active")
        .forEach((el) => el.classList.remove("chapter-active"));
      const blockEditor = document.querySelector(".block-editor");
      const target = blockEditor?.children[e.payload.index];
      target?.classList.add("chapter-active");
    });
    return () => {
      promise.then((f) => f()).catch(() => undefined);
    };
  }, []);

  // Clear the active chapter highlight whenever the prompter window closes.
  const prompterOpen = usePrompter((s) => s.prompterOpen);
  useEffect(() => {
    if (prompterOpen) return;
    document
      .querySelectorAll(".block-editor > .chapter-active")
      .forEach((el) => el.classList.remove("chapter-active"));
  }, [prompterOpen]);

  // Keyboard shortcuts sent from the prompter window arrive as prompter:cmd
  // events. Apply them to the store; the bridge re-broadcasts state back.
  useEffect(() => {
    const promise = listen<{ action: string; value?: number }>("prompter:cmd", async (e) => {
      const s = usePrompter.getState();
      switch (e.payload.action) {
        case "toggle-play":
          if (s.isPlaying) s.pause();
          else s.play();
          break;
        case "speed-up":
          s.setSpeed(Math.min(5, s.scrollSpeed + 0.1));
          break;
        case "speed-down":
          s.setSpeed(Math.max(0.5, s.scrollSpeed - 0.1));
          break;
        case "font-up":
          s.setFontSize(Math.min(120, s.fontSize + 2));
          break;
        case "font-down":
          s.setFontSize(Math.max(24, s.fontSize - 2));
          break;
        case "set-font":
          if (typeof e.payload.value === "number") {
            s.setFontSize(Math.max(24, Math.min(120, e.payload.value)));
          }
          break;
        case "restart":
          emit("prompter:restart").catch(() => undefined);
          break;
        case "toggle-voice":
          try {
            if (s.voiceSyncActive) {
              await invoke("stop_voice_sync");
              s.setVoiceSyncActive(false);
            } else {
              await invoke("start_voice_sync", {
                language: s.voiceSyncLanguage,
                model: s.voiceSyncModel,
              });
              s.setVoiceSyncActive(true);
            }
          } catch (err) {
            console.warn("toggle-voice failed", err);
          }
          break;
      }
    });
    return () => {
      promise.then((f) => f()).catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (!script) {
      setDraft(null);
      return;
    }
    // Auto-split paragraphs containing blank-line groups (one-time per script load).
    const normalized = normalizeBlocks(script.content);
    setDraft({
      title: script.title,
      content: normalized,
      wordCount: script.word_count,
    });
    if (normalized !== script.content && activeScriptId) {
      updateScript(activeScriptId, { content: normalized })
        .then(() => patchActiveScript({ content: normalized }))
        .catch(console.error);
    }
  }, [script?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useAutosave(draft, async (d) => {
    if (!d || !activeScriptId) return;
    await updateScript(activeScriptId, {
      title: d.title,
      content: d.content,
      word_count: d.wordCount,
    });
    patchActiveScript({
      title: d.title,
      content: d.content,
      word_count: d.wordCount,
    });
    setSavedAt(new Date());
  });

  function handleEditorChange(change: RichEditorChange) {
    cursorOffsetRef.current = change.cursorOffset;
    docLengthRef.current = Math.max(1, change.docSize);
    setDraft((prev) => {
      if (!prev) return prev;
      if (prev.content === change.json && prev.wordCount === change.wordCount) {
        return prev;
      }
      return { ...prev, content: change.json, wordCount: change.wordCount };
    });
  }

  return (
    <div className="flex h-full flex-col">
      {/* Single window-wide drag region above the columns — gives traffic lights room and lets you grab from anywhere across the top */}
      <div
        data-tauri-drag-region
        className="titlebar-drag h-10 shrink-0 border-b border-neutral-800 bg-neutral-950"
      />
      <div className="flex flex-1 overflow-hidden">
        <ScriptList />
        {settingsOpen && <SettingsPanel />}
        <section className="flex flex-1 flex-col overflow-hidden">
          {script && draft ? (
            <>
              {activeScriptId && <ControlBar scriptId={activeScriptId} />}
              <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
                <input
                  data-script-title-input
                  value={draft.title}
                  onChange={(e) =>
                    setDraft((p) => (p ? { ...p, title: e.target.value } : p))
                  }
                  className="flex-1 bg-transparent text-xl font-semibold text-neutral-100 focus:outline-none"
                  placeholder="Untitled script"
                />
                <div className="flex items-center gap-3 text-xs text-neutral-500">
                  <span>{draft.wordCount} words</span>
                  <span>
                    {savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : "Not saved yet"}
                  </span>
                  <ImportExportMenu
                    scriptId={activeScriptId}
                    title={draft.title}
                    contentJson={draft.content}
                  />
                  <button
                    type="button"
                    onClick={() => setSettingsOpen((v) => !v)}
                    className="rounded border border-neutral-700 px-2 py-0.5 text-neutral-300 hover:bg-neutral-800"
                  >
                    {settingsOpen ? "Hide settings" : "Show settings"}
                  </button>
                </div>
              </header>
              <div className="flex flex-1 overflow-hidden">
                <div className="flex-1 overflow-hidden">
                  <RichEditor
                    scriptId={script.id}
                    initialContent={script.content}
                    onChange={handleEditorChange}
                  />
                </div>
                {activeScriptId && (
                  <Bookmarks
                    scriptId={activeScriptId}
                    estimatedDocLength={docLengthRef.current}
                    getCurrentOffset={() => cursorOffsetRef.current}
                  />
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-neutral-500">
              <p className="text-base font-medium text-neutral-300">No script selected</p>
              <p className="text-sm">
                Pick one from the sidebar, or click <span className="font-mono">+ Script</span> to create one.
              </p>
              <div className="mt-2">
                <ImportExportMenu scriptId={null} title="" contentJson="" />
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
