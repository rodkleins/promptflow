import { emit } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import {
  createBookmark,
  deleteBookmark,
  listBookmarks,
} from "../../db/client";
import type { Bookmark } from "../../types";

interface Props {
  scriptId: string;
  estimatedDocLength: number;
  getCurrentOffset: () => number;
}

export function Bookmarks({ scriptId, estimatedDocLength, getCurrentOffset }: Props) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);

  useEffect(() => {
    (async () => setBookmarks(await listBookmarks(scriptId)))();
  }, [scriptId]);

  async function handleAdd() {
    const label = prompt("Bookmark label?", `Mark ${bookmarks.length + 1}`);
    if (!label) return;
    const offset = getCurrentOffset();
    const b = await createBookmark(scriptId, label, offset);
    setBookmarks((prev) => [...prev, b].sort((a, b) => a.char_offset - b.char_offset));
  }

  async function handleDelete(id: string) {
    await deleteBookmark(id);
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
  }

  function handleJump(b: Bookmark) {
    const ratio = estimatedDocLength > 0 ? b.char_offset / estimatedDocLength : 0;
    emit("prompter:jump", { ratio }).catch(console.error);
  }

  return (
    <div className="border-l border-neutral-800 bg-neutral-900 p-3 w-56">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wide text-neutral-400 uppercase">
          Bookmarks
        </h3>
        <button
          type="button"
          onClick={handleAdd}
          className="rounded bg-indigo-600 px-2 py-0.5 text-xs text-white hover:bg-indigo-500"
        >
          + Mark
        </button>
      </div>
      <ul className="mt-2 space-y-1">
        {bookmarks.map((b) => (
          <li key={b.id} className="flex items-center justify-between gap-1">
            <button
              type="button"
              onClick={() => handleJump(b)}
              className="flex-1 truncate rounded px-2 py-1 text-left text-xs text-neutral-300 hover:bg-neutral-800"
            >
              {b.label}
            </button>
            <button
              type="button"
              onClick={() => handleDelete(b.id)}
              className="text-xs text-neutral-600 hover:text-red-400"
            >
              ×
            </button>
          </li>
        ))}
        {bookmarks.length === 0 && (
          <li className="text-xs text-neutral-600">No bookmarks yet.</li>
        )}
      </ul>
    </div>
  );
}
