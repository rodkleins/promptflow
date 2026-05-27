import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, useState } from "react";
import { getScript } from "../../db/client";
import { useScroll } from "../../hooks/useScroll";
import type { Script } from "../../types";

export interface PrompterState {
  isPlaying: boolean;
  scrollSpeed: number;
  fontSize: number;
  fontFamily: string;
  textColor: string;
  bgColor: string;
  marginHorizontal: number;
  marginVertical: number;
  lineSpacing: number;
  brightness: number;
  contrast: number;
  orientationDeg: number;
  isMirrored: boolean;
}

const DEFAULT_STATE: PrompterState = {
  isPlaying: false,
  scrollSpeed: 1.5,
  fontSize: 48,
  fontFamily: 'system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif',
  textColor: "#FFFFFF",
  bgColor: "#000000",
  marginHorizontal: 15,
  marginVertical: 50,
  lineSpacing: 140,
  brightness: 100,
  contrast: 100,
  orientationDeg: 0,
  isMirrored: true,
};

interface Props {
  scriptId: string;
}

export function PrompterPage({ scriptId }: Props) {
  const [script, setScript] = useState<Script | null>(null);
  const [state, setState] = useState<PrompterState>(DEFAULT_STATE);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showControls, setShowControls] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      const s = await getScript(scriptId);
      setScript(s);
    })();
  }, [scriptId]);

  useEffect(() => {
    const unlistenState = listen<Partial<PrompterState>>("prompter:state", (e) => {
      setState((prev) => ({ ...prev, ...e.payload }));
    });
    const unlistenJump = listen<{ ratio: number }>("prompter:jump", (e) => {
      const c = scrollContainerRef.current;
      if (c) c.scrollTop = Math.max(0, c.scrollHeight * e.payload.ratio);
    });
    const unlistenRestart = listen("prompter:restart", () => {
      const c = scrollContainerRef.current;
      if (c) c.scrollTop = 0;
    });
    const unlistenCountdown = listen<{ seconds: number }>("prompter:countdown", (e) => {
      runCountdown(e.payload.seconds);
    });
    const unlistenClose = listen("prompter:close", () => {
      getCurrentWindow().close();
    });
    return () => {
      unlistenState.then((f) => f());
      unlistenJump.then((f) => f());
      unlistenRestart.then((f) => f());
      unlistenCountdown.then((f) => f());
      unlistenClose.then((f) => f());
    };
  }, []);

  // Auto-hide floating controls after 3s of mouse idle
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onMove = () => {
      setShowControls(true);
      clearTimeout(timer);
      timer = setTimeout(() => setShowControls(false), 3000);
    };
    window.addEventListener("mousemove", onMove);
    onMove();
    return () => {
      window.removeEventListener("mousemove", onMove);
      clearTimeout(timer);
    };
  }, []);

  // Local DOM-level Esc + Q listener — works even if the main window has been
  // closed and the global shortcut has been unregistered.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || (e.key.toLowerCase() === "q" && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        getCurrentWindow().close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function runCountdown(seconds: number) {
    if (seconds <= 0) return;
    setCountdown(seconds);
    let n = seconds;
    const tick = () => {
      n -= 1;
      if (n <= 0) setCountdown(null);
      else {
        setCountdown(n);
        setTimeout(tick, 1000);
      }
    };
    setTimeout(tick, 1000);
  }

  useScroll(scrollContainerRef, {
    speed: state.scrollSpeed,
    isPlaying: state.isPlaying && countdown == null,
  });

  const editor = useEditor(
    {
      extensions: [StarterKit],
      content: script
        ? (() => {
            try {
              return JSON.parse(script.content);
            } catch {
              return { type: "doc", content: [{ type: "paragraph" }] };
            }
          })()
        : { type: "doc", content: [{ type: "paragraph" }] },
      editable: false,
      editorProps: {
        attributes: {
          class: "prose prose-invert max-w-none focus:outline-none",
        },
      },
    },
    [script?.id],
  );

  if (!script) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black text-neutral-600">
        Loading script…
      </div>
    );
  }

  const transform = [
    state.orientationDeg ? `rotate(${state.orientationDeg}deg)` : "",
    state.isMirrored ? "scaleX(-1)" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const counterTransform = state.isMirrored ? "scaleX(-1)" : "none";

  return (
    <div
      className="relative h-screen w-screen overflow-hidden"
      style={{
        backgroundColor: state.bgColor,
        color: state.textColor,
        cursor: showControls ? "default" : "none",
        filter: `brightness(${state.brightness}%) contrast(${state.contrast}%)`,
      }}
    >
      <div
        ref={scrollContainerRef}
        className="h-full w-full overflow-y-scroll"
        style={{
          paddingLeft: `${state.marginHorizontal}%`,
          paddingRight: `${state.marginHorizontal}%`,
          paddingTop: `${state.marginVertical}vh`,
          paddingBottom: `${state.marginVertical}vh`,
          fontFamily: state.fontFamily,
          fontSize: `${state.fontSize}px`,
          lineHeight: state.lineSpacing / 100,
          transform,
          transformOrigin: "center center",
          // Fade text above the reading line so the eye lands on the active line.
          maskImage:
            "linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.35) 25%, rgba(0,0,0,1) 50%, rgba(0,0,0,1) 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.35) 25%, rgba(0,0,0,1) 50%, rgba(0,0,0,1) 100%)",
        }}
      >
        <EditorContent editor={editor} />
      </div>

      {/* Center reading line */}
      <div
        className="pointer-events-none absolute top-1/2 right-0 left-0 h-px"
        style={{ backgroundColor: `${state.textColor}33` }}
      />

      {countdown != null && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/60">
          <span
            className="font-bold"
            style={{
              color: state.textColor,
              fontSize: "30vh",
              transform: counterTransform,
            }}
          >
            {countdown}
          </span>
        </div>
      )}

      {/* Always-on close button — last-resort exit if everything else fails */}
      <button
        type="button"
        onClick={() => getCurrentWindow().close()}
        className="absolute top-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white/90 hover:bg-red-600 hover:text-white"
        style={{ transform: counterTransform }}
        title="Close prompter (Esc)"
      >
        ×
      </button>

      {/* Floating transport hint */}
      {showControls && (
        <div
          className="absolute right-6 bottom-6 flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-xs text-white/80 backdrop-blur"
          style={{ transform: counterTransform }}
        >
          <span>
            <kbd className="rounded bg-white/10 px-1.5 py-0.5">Space</kbd> play/pause
          </span>
          <span>
            <kbd className="rounded bg-white/10 px-1.5 py-0.5">↑/↓</kbd> speed
          </span>
          <span>
            <kbd className="rounded bg-white/10 px-1.5 py-0.5">Esc</kbd> close
          </span>
        </div>
      )}
    </div>
  );
}
