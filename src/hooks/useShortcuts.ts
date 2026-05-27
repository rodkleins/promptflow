import {
  isRegistered,
  register,
  unregisterAll,
} from "@tauri-apps/plugin-global-shortcut";
import { useEffect } from "react";
import { usePrompter } from "../store/prompter";
import { usePrompterBridge } from "./usePrompterBridge";

export function useShortcuts() {
  const prompterOpen = usePrompter((s) => s.prompterOpen);
  const { closePrompter, restart } = usePrompterBridge();

  useEffect(() => {
    if (!prompterOpen) return;

    let cancelled = false;

    (async () => {
      try {
        await unregisterAll();
      } catch {
        /* ignore */
      }

      const tryRegister = async (accelerator: string, handler: () => void) => {
        try {
          if (await isRegistered(accelerator)) return;
          await register(accelerator, (event) => {
            if (event.state === "Pressed") handler();
          });
        } catch (e) {
          console.warn(`Could not register ${accelerator}`, e);
        }
      };

      await tryRegister("Space", () => {
        const cur = usePrompter.getState();
        if (cur.isPlaying) cur.pause();
        else cur.play();
      });
      await tryRegister("ArrowUp", () => {
        const cur = usePrompter.getState();
        cur.setSpeed(Math.min(5, cur.scrollSpeed + 0.1));
      });
      await tryRegister("ArrowDown", () => {
        const cur = usePrompter.getState();
        cur.setSpeed(Math.max(0.5, cur.scrollSpeed - 0.1));
      });
      await tryRegister("CommandOrControl+Equal", () => {
        const cur = usePrompter.getState();
        cur.setFontSize(Math.min(120, cur.fontSize + 2));
      });
      await tryRegister("CommandOrControl+Minus", () => {
        const cur = usePrompter.getState();
        cur.setFontSize(Math.max(24, cur.fontSize - 2));
      });
      await tryRegister("R", () => restart());
      await tryRegister("Escape", () => {
        closePrompter();
      });

      if (cancelled) {
        await unregisterAll().catch(() => undefined);
      }
    })();

    return () => {
      cancelled = true;
      unregisterAll().catch(() => undefined);
    };
  }, [prompterOpen, closePrompter, restart]);
}
