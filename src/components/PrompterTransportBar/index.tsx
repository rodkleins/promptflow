import { emit } from "@tauri-apps/api/event";

interface Props {
  isPlaying: boolean;
  voiceFollowing: boolean;
  voiceSyncActive: boolean;
  showControls: boolean;
  currentChapter: number; // 1-indexed; 0 if no chapters
  totalChapters: number;
  fontSize: number;
  counterTransform?: string;
  containerClassName?: string;
  onPrevChapter: () => void;
  onNextChapter: () => void;
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );
}
function PrevIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M6 6h2v12H6zM9.5 12l8.5 6V6z" />
    </svg>
  );
}
function NextIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
    </svg>
  );
}
function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z" />
    </svg>
  );
}

function send(action: string) {
  emit("prompter:cmd", { action }).catch(() => undefined);
}

export function PrompterTransportBar({
  isPlaying,
  voiceFollowing,
  voiceSyncActive,
  showControls,
  currentChapter,
  totalChapters,
  fontSize,
  counterTransform = "none",
  containerClassName = "absolute right-0 bottom-6 left-0 flex justify-center",
  onPrevChapter,
  onNextChapter,
}: Props) {
  if (!showControls) return null;
  const baseBtn =
    "flex items-center justify-center rounded-full text-white/90 hover:bg-white/15";

  return (
    <div
      className={containerClassName}
      style={{ transform: counterTransform }}
    >
      <div className="flex items-center gap-2 rounded-full bg-black/75 px-3 py-2 backdrop-blur">
        {/* font size slider (Elgato-style) */}
        <div className="flex items-center gap-2 px-2">
          <span className="text-[11px] leading-none text-white/60">A</span>
          <input
            type="range"
            min={24}
            max={120}
            step={2}
            value={fontSize}
            onChange={(e) =>
              emit("prompter:cmd", { action: "set-font", value: Number(e.target.value) }).catch(
                () => undefined,
              )
            }
            className="h-1 w-24 accent-white"
            title={`Font size ${fontSize}px`}
          />
          <span className="text-base leading-none text-white/60">A</span>
        </div>
        {/* prev chapter */}
        <button
          type="button"
          onClick={onPrevChapter}
          disabled={totalChapters === 0}
          className={`${baseBtn} h-9 w-9 disabled:opacity-30`}
          title="Previous chapter"
        >
          <PrevIcon />
        </button>
        {/* play / pause (big) */}
        <button
          type="button"
          onClick={() => send("toggle-play")}
          className={`${baseBtn} h-12 w-12 bg-white/10`}
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        {/* next chapter */}
        <button
          type="button"
          onClick={onNextChapter}
          disabled={totalChapters === 0}
          className={`${baseBtn} h-9 w-9 disabled:opacity-30`}
          title="Next chapter"
        >
          <NextIcon />
        </button>
        {/* chapter counter */}
        {totalChapters > 0 && (
          <div className="px-2 font-mono text-[11px] text-white/60">
            {currentChapter}/{totalChapters}
          </div>
        )}
        {/* divider */}
        <div className="mx-1 h-6 w-px bg-white/20" />
        {/* mic toggle */}
        <button
          type="button"
          onClick={() => send("toggle-voice")}
          className={`${baseBtn} h-9 w-9 ${
            voiceSyncActive
              ? voiceFollowing
                ? "bg-indigo-600 hover:bg-indigo-500"
                : "bg-amber-600 hover:bg-amber-500"
              : ""
          }`}
          title={
            voiceSyncActive
              ? voiceFollowing
                ? "Voice Sync ON (following)"
                : "Voice Sync ON (not following)"
              : "Start Voice Sync"
          }
        >
          <MicIcon />
        </button>
      </div>
    </div>
  );
}
