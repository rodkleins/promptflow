import { useVoiceSync } from "../../hooks/useVoiceSync";
import { usePrompter } from "../../store/prompter";

const MODELS: { label: string; value: string; size: string }[] = [
  { label: "Tiny (~75 MB, faster)", value: "tiny", size: "75 MB" },
  { label: "Base (~142 MB, more accurate)", value: "base", size: "142 MB" },
];

const LANGUAGES: { label: string; value: string }[] = [
  { label: "Portuguese (BR)", value: "pt" },
  { label: "English", value: "en" },
  { label: "Spanish", value: "es" },
  { label: "Auto-detect", value: "auto" },
];

function formatMB(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function VoiceSyncPanel() {
  const model = usePrompter((s) => s.voiceSyncModel);
  const setModel = usePrompter((s) => s.setVoiceSyncModel);
  const language = usePrompter((s) => s.voiceSyncLanguage);
  const setLanguage = usePrompter((s) => s.setVoiceSyncLanguage);
  const voiceFollow = usePrompter((s) => s.voiceFollow);
  const setVoiceFollow = usePrompter((s) => s.setVoiceFollow);
  const silenceBehavior = usePrompter((s) => s.voiceSilenceBehavior);
  const applySettings = usePrompter((s) => s.applySettings);

  const {
    active,
    status,
    progress,
    transcript,
    error,
    isDownloading,
    download,
    start,
    stop,
  } = useVoiceSync();

  const downloaded = status?.present ?? false;

  return (
    <div className="space-y-3">
      <p className="text-xs text-neutral-400">
        Whisper transcribes the microphone in real time and (eventually) auto-paces the
        scroll to the speaker. Slice 1: transcript preview only.
      </p>

      <label className="block">
        <span className="text-xs text-neutral-400">Model</span>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={active || isDownloading}
          className="mt-1 w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-sm text-neutral-200 disabled:opacity-50"
        >
          {MODELS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-xs text-neutral-400">Language</span>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          disabled={active}
          className="mt-1 w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-sm text-neutral-200 disabled:opacity-50"
        >
          {LANGUAGES.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </label>

      {!downloaded && !isDownloading && (
        <button
          type="button"
          onClick={download}
          className="w-full rounded bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Download {model} model
        </button>
      )}

      {isDownloading && progress && (
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] text-neutral-400">
            <span>Downloading {progress.name}…</span>
            <span>
              {formatMB(progress.downloaded)}
              {progress.total > 0 ? ` / ${formatMB(progress.total)}` : ""}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded bg-neutral-800">
            <div
              className="h-full bg-indigo-500 transition-all"
              style={{
                width: progress.total
                  ? `${Math.min(100, (progress.downloaded / progress.total) * 100)}%`
                  : "20%",
              }}
            />
          </div>
        </div>
      )}

      {downloaded && (
        <div className="text-[11px] text-neutral-500">
          Model installed ({formatMB(status?.bytes ?? 0)})
        </div>
      )}

      {downloaded && (
        <label className="flex items-center justify-between text-xs text-neutral-400">
          <span>Follow voice (auto-pace prompter)</span>
          <input
            type="checkbox"
            checked={voiceFollow}
            onChange={(e) => setVoiceFollow(e.target.checked)}
            className="accent-indigo-500"
          />
        </label>
      )}

      {downloaded && (
        <label className="block">
          <span className="text-xs text-neutral-400">On silence</span>
          <select
            value={silenceBehavior}
            onChange={(e) =>
              applySettings({
                voiceSilenceBehavior: e.target.value as "stop" | "slow",
              })
            }
            className="mt-1 w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-sm text-neutral-200"
          >
            <option value="slow">Slow down (keep crawling)</option>
            <option value="stop">Stop (full pause)</option>
          </select>
        </label>
      )}

      {downloaded && !active && (
        <button
          type="button"
          onClick={start}
          className="w-full rounded bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-500"
        >
          Start Voice Sync
        </button>
      )}

      {active && (
        <button
          type="button"
          onClick={stop}
          className="w-full rounded border border-red-900/60 px-3 py-2 text-sm text-red-400 hover:bg-red-900/30"
        >
          Stop Voice Sync
        </button>
      )}

      {active && (
        <div className="space-y-1">
          <div className="text-[11px] text-neutral-400">Live transcript</div>
          <div className="max-h-40 min-h-[3rem] space-y-1 overflow-y-auto rounded border border-neutral-800 bg-neutral-950 px-2 py-1 font-mono text-[11px] text-neutral-300">
            {transcript.length === 0 && (
              <div className="text-neutral-600 italic">Listening…</div>
            )}
            {transcript.map((line, i) => (
              <div key={`${i}-${line.slice(0, 12)}`}>{line}</div>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
