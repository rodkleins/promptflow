import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePrompter } from "../store/prompter";

interface RemoteCommand {
  action: string;
  value?: number;
  ratio?: number;
}

export interface RemoteInfo {
  port: number;
  ip: string;
  url: string;
}

function snapshot() {
  const s = usePrompter.getState();
  return {
    isPlaying: s.isPlaying,
    scrollSpeed: s.scrollSpeed,
    fontSize: s.fontSize,
    bookmarks: [] as { label: string; ratio: number }[], // populated by caller
  };
}

export function useRemote() {
  const [info, setInfo] = useState<RemoteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startingRef = useRef(false);

  const start = useCallback(async () => {
    if (startingRef.current || info) return;
    startingRef.current = true;
    try {
      const [port, ip] = await Promise.all([
        invoke<number>("start_remote_server"),
        invoke<string>("get_local_ip"),
      ]);
      setInfo({ port, ip, url: `http://${ip}:${port}` });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      startingRef.current = false;
    }
  }, [info]);

  const stop = useCallback(async () => {
    try {
      await invoke("stop_remote_server");
      setInfo(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Dispatch incoming remote commands onto the store
  useEffect(() => {
    if (!info) return;
    const promise = listen<string>("remote:command", (e) => {
      let cmd: RemoteCommand;
      try {
        cmd = JSON.parse(e.payload);
      } catch {
        return;
      }
      const store = usePrompter.getState();
      switch (cmd.action) {
        case "play":
          store.play();
          break;
        case "pause":
          store.pause();
          break;
        case "speed-up":
          store.setSpeed(Math.min(5, store.scrollSpeed + 0.1));
          break;
        case "speed-down":
          store.setSpeed(Math.max(0.5, store.scrollSpeed - 0.1));
          break;
        case "font-up":
          store.setFontSize(Math.min(140, store.fontSize + 2));
          break;
        case "font-down":
          store.setFontSize(Math.max(24, store.fontSize - 2));
          break;
        case "restart":
          emit("prompter:restart").catch(() => undefined);
          break;
        case "jump":
          if (typeof cmd.ratio === "number") {
            emit("prompter:jump", { ratio: cmd.ratio }).catch(() => undefined);
          }
          break;
      }
    });
    return () => {
      promise.then((f) => f()).catch(() => undefined);
    };
  }, [info]);

  // Broadcast store state to connected clients
  useEffect(() => {
    if (!info) return;
    const push = () => {
      invoke("broadcast_remote_state", {
        payload: JSON.stringify(snapshot()),
      }).catch(console.error);
    };
    push();
    const unsub = usePrompter.subscribe((state, prev) => {
      if (
        state.isPlaying !== prev.isPlaying ||
        state.scrollSpeed !== prev.scrollSpeed ||
        state.fontSize !== prev.fontSize
      ) {
        push();
      }
    });
    return unsub;
  }, [info]);

  return { info, error, start, stop };
}
