import { emit } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { usePrompter } from "../store/prompter";
import { usePrompterBridge } from "./usePrompterBridge";

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function useShortcuts() {
  const { closePrompter, restart } = usePrompterBridge();
  const prompterOpen = usePrompter((s) => s.prompterOpen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      // Escape only does something when the prompter window is open.
      if (e.key === "Escape" && !prompterOpen) return;

      const cur = usePrompter.getState();
      switch (e.key) {
        case " ":
          e.preventDefault();
          if (cur.isPlaying) cur.pause();
          else cur.play();
          break;
        case "ArrowUp":
          e.preventDefault();
          cur.setSpeed(Math.min(5, cur.scrollSpeed + 0.1));
          break;
        case "ArrowDown":
          e.preventDefault();
          cur.setSpeed(Math.max(0.5, cur.scrollSpeed - 0.1));
          break;
        case "+":
        case "=":
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            cur.setFontSize(Math.min(120, cur.fontSize + 2));
          }
          break;
        case "-":
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            cur.setFontSize(Math.max(24, cur.fontSize - 2));
          }
          break;
        case "r":
        case "R":
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            restart();
          }
          break;
        case "Escape":
          e.preventDefault();
          closePrompter();
          break;
        case "<":
        case "ArrowLeft":
          if (!e.metaKey && !e.ctrlKey && prompterOpen) {
            e.preventDefault();
            emit("prompter:chapter-cmd", { direction: "prev" }).catch(() => undefined);
          }
          break;
        case ">":
        case "ArrowRight":
          if (!e.metaKey && !e.ctrlKey && prompterOpen) {
            e.preventDefault();
            emit("prompter:chapter-cmd", { direction: "next" }).catch(() => undefined);
          }
          break;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [prompterOpen, closePrompter, restart]);
}
