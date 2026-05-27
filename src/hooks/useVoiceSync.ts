import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePrompter } from "../store/prompter";

export interface ModelStatus {
  name: string;
  present: boolean;
  bytes: number;
  path: string;
}

export interface DownloadProgress {
  name: string;
  downloaded: number;
  total: number;
}

interface TranscriptPayload {
  text: string;
}

const MAX_TRANSCRIPT_LINES = 20;

export function useVoiceSync() {
  const language = usePrompter((s) => s.voiceSyncLanguage);
  const model = usePrompter((s) => s.voiceSyncModel);
  const active = usePrompter((s) => s.voiceSyncActive);
  const setActive = usePrompter((s) => s.setVoiceSyncActive);

  const [status, setStatus] = useState<ModelStatus | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const downloadingRef = useRef(false);

  const refreshStatus = useCallback(
    async (name: string = model) => {
      try {
        const s = await invoke<ModelStatus>("check_whisper_model", { name });
        setStatus(s);
        return s;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return null;
      }
    },
    [model],
  );

  useEffect(() => {
    refreshStatus(model).catch(() => undefined);
  }, [model, refreshStatus]);

  useEffect(() => {
    const transcriptUnsub = listen<TranscriptPayload>("voice:transcript", (e) => {
      setTranscript((prev) => {
        const next = [...prev, e.payload.text];
        return next.length > MAX_TRANSCRIPT_LINES
          ? next.slice(next.length - MAX_TRANSCRIPT_LINES)
          : next;
      });
    });
    const progressUnsub = listen<DownloadProgress>("voice:download-progress", (e) => {
      setProgress(e.payload);
    });
    return () => {
      transcriptUnsub.then((f) => f()).catch(() => undefined);
      progressUnsub.then((f) => f()).catch(() => undefined);
    };
  }, []);

  const download = useCallback(async () => {
    if (downloadingRef.current) return;
    downloadingRef.current = true;
    setError(null);
    setProgress({ name: model, downloaded: 0, total: 0 });
    try {
      const result = await invoke<ModelStatus>("download_whisper_model", {
        name: model,
      });
      setStatus(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      downloadingRef.current = false;
      setProgress(null);
    }
  }, [model]);

  const start = useCallback(async () => {
    setError(null);
    setTranscript([]);
    try {
      await invoke("start_voice_sync", { language, model });
      setActive(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [language, model, setActive]);

  const stop = useCallback(async () => {
    try {
      await invoke("stop_voice_sync");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActive(false);
    }
  }, [setActive]);

  return {
    active,
    status,
    progress,
    transcript,
    error,
    isDownloading: downloadingRef.current || progress !== null,
    refreshStatus,
    download,
    start,
    stop,
  };
}
