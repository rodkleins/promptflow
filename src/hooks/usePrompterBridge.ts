import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { type PrompterSettings, usePrompter } from "../store/prompter";
import type { DisplayInfo } from "../types";

const BROADCAST_FIELDS: (keyof PrompterSettings | "isPlaying")[] = [
  "isPlaying",
  "scrollSpeed",
  "fontSize",
  "fontFamily",
  "textColor",
  "bgColor",
  "marginHorizontal",
  "marginVertical",
  "lineSpacing",
  "brightness",
  "contrast",
  "orientationDeg",
  "isMirrored",
];

function collectState() {
  const s = usePrompter.getState();
  return {
    isPlaying: s.isPlaying,
    scrollSpeed: s.scrollSpeed,
    fontSize: s.fontSize,
    fontFamily: s.fontFamily,
    textColor: s.textColor,
    bgColor: s.bgColor,
    marginHorizontal: s.marginHorizontal,
    marginVertical: s.marginVertical,
    lineSpacing: s.lineSpacing,
    brightness: s.brightness,
    contrast: s.contrast,
    orientationDeg: s.orientationDeg,
    isMirrored: s.isMirrored,
  };
}

export function usePrompterBridge() {
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const prompterOpen = usePrompter((s) => s.prompterOpen);
  const setPrompterOpen = usePrompter((s) => s.setPrompterOpen);

  useEffect(() => {
    (async () => {
      try {
        const list = await invoke<DisplayInfo[]>("list_displays");
        setDisplays(list);
      } catch (e) {
        console.error("list_displays failed", e);
      }
    })();
  }, []);

  // Direct store subscription: broadcast prompter state when any tracked field changes.
  useEffect(() => {
    if (!prompterOpen) return;
    // Initial broadcast on open
    emit("prompter:state", collectState()).catch(console.error);
    const unsub = usePrompter.subscribe((state, prev) => {
      const changed = BROADCAST_FIELDS.some(
        (f) => state[f as keyof typeof state] !== prev[f as keyof typeof prev],
      );
      if (changed) {
        emit("prompter:state", collectState()).catch(console.error);
      }
    });
    return unsub;
  }, [prompterOpen]);

  const openPrompter = useCallback(
    async (displayId: number, scriptId: string) => {
      const countdownSeconds = usePrompter.getState().countdownSeconds;
      await invoke("open_prompter_window", { displayId, scriptId });
      setPrompterOpen(true);
      setTimeout(() => {
        emit("prompter:state", collectState()).catch(console.error);
        if (countdownSeconds > 0) {
          emit("prompter:countdown", { seconds: countdownSeconds }).catch(console.error);
        }
      }, 300);
    },
    [setPrompterOpen],
  );

  const closePrompter = useCallback(async () => {
    await emit("prompter:close").catch(() => undefined);
    await invoke("close_prompter_window");
    setPrompterOpen(false);
    usePrompter.setState({ isPlaying: false });
  }, [setPrompterOpen]);

  const restart = useCallback(() => {
    emit("prompter:restart").catch(console.error);
  }, []);

  const jumpToRatio = useCallback((ratio: number) => {
    emit("prompter:jump", { ratio }).catch(console.error);
  }, []);

  return {
    displays,
    prompterOpen,
    openPrompter,
    closePrompter,
    restart,
    jumpToRatio,
  };
}
