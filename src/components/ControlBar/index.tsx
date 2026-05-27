import { useState } from "react";
import { usePrompterBridge } from "../../hooks/usePrompterBridge";
import { usePrompter } from "../../store/prompter";

interface Props {
  scriptId: string;
}

export function ControlBar({ scriptId }: Props) {
  const isPlaying = usePrompter((s) => s.isPlaying);
  const play = usePrompter((s) => s.play);
  const pause = usePrompter((s) => s.pause);

  const { displays, prompterOpen, openPrompter, closePrompter, restart } = usePrompterBridge();
  const [pickedDisplay, setPickedDisplay] = useState<number | null>(null);

  const effectiveDisplay =
    pickedDisplay ?? displays.find((d) => !d.is_primary)?.id ?? displays[0]?.id ?? null;

  if (!prompterOpen) {
    return (
      <div className="flex items-center gap-2 border-b border-neutral-800 bg-neutral-900 px-4 py-2">
        <label className="text-xs text-neutral-500">Output:</label>
        <select
          value={effectiveDisplay ?? ""}
          onChange={(e) => setPickedDisplay(Number(e.target.value))}
          className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
        >
          {displays.length === 0 && <option value="">No displays detected</option>}
          {displays.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label} — {d.width}×{d.height}
              {d.is_primary ? " (primary)" : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            if (effectiveDisplay == null) return;
            openPrompter(effectiveDisplay, scriptId);
            play();
          }}
          disabled={effectiveDisplay == null}
          className="ml-auto rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:bg-neutral-700"
        >
          Open Prompter ▶
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 border-b border-neutral-800 bg-neutral-900 px-4 py-2">
      <button
        type="button"
        onClick={() => (isPlaying ? pause() : play())}
        className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500"
      >
        {isPlaying ? "❚❚ Pause" : "▶ Play"}
      </button>
      <button
        type="button"
        onClick={restart}
        className="rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
      >
        ⟲ Restart
      </button>
      <span className="ml-2 text-xs text-neutral-500">Prompter live</span>
      <button
        type="button"
        onClick={() => {
          pause();
          closePrompter();
        }}
        className="ml-auto rounded border border-red-900/60 px-3 py-1 text-xs text-red-400 hover:bg-red-900/30"
      >
        Close Prompter
      </button>
    </div>
  );
}
