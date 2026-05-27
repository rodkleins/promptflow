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
  const prompterOpen = usePrompter((s) => s.prompterOpen);
  const { closePrompter, restart } = usePrompterBridge();

  useEffect(() => {
    if (!prompterOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

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
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [prompterOpen, closePrompter, restart]);
}
