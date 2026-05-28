import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, useState } from "react";
import { PrompterTransportBar } from "../../components/PrompterTransportBar";
import { getScript } from "../../db/client";
import { useScroll } from "../../hooks/useScroll";
import { dlog } from "../../lib/log";
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
  textOpacity: number;
  autoLoop: boolean;
  readingLinePosition: number;
  voiceSyncActive: boolean;
  voiceFollowing: boolean;
  voiceSilenceBehavior: "stop" | "slow";
}

// Tokenize visible DOM text into one Range per alphanumeric run, mirroring
// the editor's tokenize() in useVoicePacing so word indexes line up exactly.
function buildWordRanges(root: HTMLElement): Range[] {
  const ranges: Range[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const isAlphaNum = (ch: string) => /[\p{L}\p{N}]/u.test(ch);
  let node: Text | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: walker pattern
  while ((node = walker.nextNode() as Text | null)) {
    const text = node.nodeValue ?? "";
    let i = 0;
    while (i < text.length) {
      while (i < text.length && !isAlphaNum(text[i])) i++;
      if (i >= text.length) break;
      const start = i;
      while (i < text.length && isAlphaNum(text[i])) i++;
      const range = new Range();
      range.setStart(node, start);
      range.setEnd(node, i);
      ranges.push(range);
    }
  }
  return ranges;
}

function applyWordHighlight(wordIndex: number, ranges: Range[]) {
  const range = ranges[wordIndex];
  if (!range) return;
  const HighlightCtor = (window as unknown as { Highlight?: typeof Highlight }).Highlight;
  const highlights = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
  if (!HighlightCtor || !highlights) return;
  highlights.set("voice-cursor", new HighlightCtor(range));
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
  textOpacity: 100,
  autoLoop: false,
  readingLinePosition: 50,
  voiceSyncActive: false,
  voiceFollowing: false,
  voiceSilenceBehavior: "slow",
};

interface Props {
  scriptId: string;
}

export function PrompterPage({ scriptId }: Props) {
  const [script, setScript] = useState<Script | null>(null);
  const [state, setState] = useState<PrompterState>(DEFAULT_STATE);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [voiceMultiplier, setVoiceMultiplier] = useState(1);
  const [lastDelta, setLastDelta] = useState<number | null>(null);
  const [speakerRatio, setSpeakerRatio] = useState<number | null>(null);
  const [currentRatio, setCurrentRatio] = useState<number | null>(null);
  const [showVoiceDebug, setShowVoiceDebug] = useState(false);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [totalChapters, setTotalChapters] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const wordRangesRef = useRef<Range[]>([]);
  const chapterElementsRef = useRef<HTMLElement[]>([]);
  const readingLineRef = useRef(50);
  readingLineRef.current = state.readingLinePosition;
  // Multiplier driven by voice events (1+k·delta, smoothed).
  const activeMultiplierRef = useRef(1);
  // Envelope that fades to 0 when the speaker goes silent. Multiplied into the active one.
  const silenceEnvelopeRef = useRef(1);
  const lastVoiceAtRef = useRef(0);

  function publishMultiplier() {
    const m = activeMultiplierRef.current * silenceEnvelopeRef.current;
    setVoiceMultiplier(m);
  }

  // Silence detector: fade out the envelope after 2 s of no voice events, over 3 s.
  useEffect(() => {
    if (!state.voiceFollowing) {
      activeMultiplierRef.current = 1;
      silenceEnvelopeRef.current = 1;
      setVoiceMultiplier(1);
      lastVoiceAtRef.current = 0;
      return;
    }
    const id = setInterval(() => {
      if (lastVoiceAtRef.current === 0) return;
      const silentMs = Date.now() - lastVoiceAtRef.current;
      // "stop" floors at 0 (pause). "slow" floors at 0.3 so the prompter keeps
      // crawling and the speaker can see what's coming next.
      const floor = state.voiceSilenceBehavior === "stop" ? 0 : 0.3;
      if (silentMs <= 2000) {
        silenceEnvelopeRef.current = 1;
      } else {
        const decay = Math.max(0, 1 - (silentMs - 2000) / 3000);
        silenceEnvelopeRef.current = floor + (1 - floor) * decay;
      }
      publishMultiplier();
    }, 200);
    return () => clearInterval(id);
  }, [state.voiceFollowing, state.voiceSilenceBehavior]);

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
    const unlistenVoicePos = listen<{ ratio: number; wordIndex?: number }>("prompter:voice-pos", (e) => {
      if (typeof e.payload.wordIndex === "number") {
        applyWordHighlight(e.payload.wordIndex, wordRangesRef.current);
      }
      const c = scrollContainerRef.current;
      if (!c) {
        dlog("[voice-pacing/prompter]", "no scroll container");
        return;
      }
      const scrollable = Math.max(1, c.scrollHeight - c.clientHeight);
      const currentRatio = c.scrollTop / scrollable;
      const delta = e.payload.ratio - currentRatio;
      lastVoiceAtRef.current = Date.now();
      silenceEnvelopeRef.current = 1;

      // Position lock: gap > 10% of script → snap-scroll to the speaker.
      if (Math.abs(delta) > 0.1) {
        // Land the speaker's position on the configured reading line, not hard-coded 40%.
        const target = Math.max(
          0,
          c.scrollHeight * e.payload.ratio - c.clientHeight * (readingLineRef.current / 100),
        );
        c.scrollTo({ top: target, behavior: "smooth" });
        activeMultiplierRef.current = 1;
        publishMultiplier();
        setLastDelta(delta);
        setSpeakerRatio(e.payload.ratio);
        setCurrentRatio(currentRatio);
        dlog(
          "[voice-pacing/prompter]",
          "POSITION LOCK speaker=",
          e.payload.ratio.toFixed(3),
          "current=",
          currentRatio.toFixed(3),
          "delta=",
          delta.toFixed(3),
        );
        return;
      }

      // Speed control: 1 + 40·delta, clamped [0, 4], fast EMA (40/60).
      const target = Math.min(4, Math.max(0, 1 + 40 * delta));
      const before = activeMultiplierRef.current;
      activeMultiplierRef.current = activeMultiplierRef.current * 0.4 + target * 0.6;
      publishMultiplier();
      setLastDelta(delta);
      setSpeakerRatio(e.payload.ratio);
      setCurrentRatio(currentRatio);
      dlog(
        "[voice-pacing/prompter]",
        "speaker=",
        e.payload.ratio.toFixed(3),
        "current=",
        currentRatio.toFixed(3),
        "delta=",
        delta.toFixed(3),
        "target×",
        target.toFixed(2),
        "active",
        before.toFixed(2),
        "→",
        activeMultiplierRef.current.toFixed(2),
      );
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
      unlistenVoicePos.then((f) => f());
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

  // Keyboard shortcuts inside the prompter window. Forwarded to the editor so
  // the playing/speed store stays the source of truth.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || (e.key.toLowerCase() === "q" && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        getCurrentWindow().close();
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        emit("prompter:cmd", { action: "toggle-play" }).catch(() => undefined);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        emit("prompter:cmd", { action: "speed-up" }).catch(() => undefined);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        emit("prompter:cmd", { action: "speed-down" }).catch(() => undefined);
        return;
      }
      if (e.key.toLowerCase() === "r" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        emit("prompter:cmd", { action: "restart" }).catch(() => undefined);
        return;
      }
      if (e.key.toLowerCase() === "d" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setShowVoiceDebug((v) => !v);
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

  const effectiveSpeed = state.scrollSpeed * (state.voiceFollowing ? voiceMultiplier : 1);
  useScroll(scrollContainerRef, {
    speed: effectiveSpeed,
    isPlaying: state.isPlaying && countdown == null,
    autoLoop: state.autoLoop,
  });

  // Build the per-word DOM Range index after the script renders. Re-run when the
  // script id changes so we always point at the right text.
  useEffect(() => {
    if (!script) return;
    // Wait a frame so Tiptap has actually committed its DOM.
    const id = requestAnimationFrame(() => {
      const c = scrollContainerRef.current;
      if (!c) return;
      wordRangesRef.current = buildWordRanges(c);
      const chapters = Array.from(
        c.querySelectorAll<HTMLElement>("p, h1, h2, h3, blockquote"),
      );
      chapterElementsRef.current = chapters;
      setTotalChapters(chapters.length);
      setChapterIndex(0);
      dlog(
        "[voice-pacing/prompter]",
        "built word ranges:",
        wordRangesRef.current.length,
        "chapters:",
        chapters.length,
      );
    });
    return () => cancelAnimationFrame(id);
  }, [script?.id]);

  // Track which chapter the reading line is on as the user/voice scrolls.
  useEffect(() => {
    const c = scrollContainerRef.current;
    if (!c || totalChapters === 0) return;
    const onScroll = () => {
      const els = chapterElementsRef.current;
      const containerRect = c.getBoundingClientRect();
      const readingY = containerRect.top + c.clientHeight * (state.readingLinePosition / 100);
      let idx = 0;
      for (let i = 0; i < els.length; i++) {
        const r = els[i].getBoundingClientRect();
        if (r.top <= readingY) idx = i;
        else break;
      }
      setChapterIndex(idx);
    };
    c.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => c.removeEventListener("scroll", onScroll);
  }, [totalChapters]);

  // Mirror the current chapter back to the editor so it can highlight the
  // matching paragraph card in the script list.
  useEffect(() => {
    if (totalChapters === 0) return;
    emit("prompter:chapter", { index: chapterIndex }).catch(() => undefined);
  }, [chapterIndex, totalChapters]);

  function scrollToChapter(i: number) {
    const els = chapterElementsRef.current;
    const c = scrollContainerRef.current;
    if (!c || i < 0 || i >= els.length) return;
    const containerRect = c.getBoundingClientRect();
    const targetRect = els[i].getBoundingClientRect();
    const targetTop = targetRect.top - containerRect.top + c.scrollTop - c.clientHeight * (state.readingLinePosition / 100);
    c.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
  }
  const onPrevChapter = () => scrollToChapter(Math.max(0, chapterIndex - 1));
  const onNextChapter = () => scrollToChapter(Math.min(totalChapters - 1, chapterIndex + 1));

  // Clear highlight when voice-following turns off so a stale word doesn't linger.
  useEffect(() => {
    if (state.voiceFollowing) return;
    const highlights = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
    highlights?.delete("voice-cursor");
  }, [state.voiceFollowing]);
  useEffect(() => {
    dlog(
      "[voice-pacing/prompter]",
      "state",
      {
        voiceFollowing: state.voiceFollowing,
        isPlaying: state.isPlaying,
        baseSpeed: state.scrollSpeed,
        mult: Number(voiceMultiplier.toFixed(2)),
        effective: Number(effectiveSpeed.toFixed(2)),
      },
    );
  }, [state.voiceFollowing, state.isPlaying, state.scrollSpeed, voiceMultiplier, effectiveSpeed]);

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
          class: "prose prose-invert max-w-none focus:outline-none prompter-text",
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
          // The mid-stop sits at the configured reading-line position.
          maskImage: `linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.35) ${state.readingLinePosition / 2}%, rgba(0,0,0,1) ${state.readingLinePosition}%, rgba(0,0,0,1) 100%)`,
          WebkitMaskImage: `linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.35) ${state.readingLinePosition / 2}%, rgba(0,0,0,1) ${state.readingLinePosition}%, rgba(0,0,0,1) 100%)`,
        }}
      >
        <div style={{ opacity: state.textOpacity / 100 }}>
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Reading line — position is configurable via Settings */}
      <div
        className="pointer-events-none absolute right-0 left-0 h-px"
        style={{
          top: `${state.readingLinePosition}%`,
          backgroundColor: `${state.textColor}33`,
        }}
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

      {/* Voice-sync debug HUD — toggled by the D key / the [D] button */}
      {state.voiceFollowing && showVoiceDebug && (
        <div
          className="pointer-events-none absolute top-3 left-3 z-10 rounded bg-black/70 px-3 py-2 font-mono text-[11px] leading-tight text-white/90"
          style={{ transform: counterTransform }}
        >
          <div>voice-follow: ON</div>
          <div>base speed: {state.scrollSpeed.toFixed(2)}</div>
          <div>active mult: {activeMultiplierRef.current.toFixed(2)}×</div>
          <div>silence env: {silenceEnvelopeRef.current.toFixed(2)}</div>
          <div>effective mult: {voiceMultiplier.toFixed(2)}×</div>
          <div>effective speed: {effectiveSpeed.toFixed(2)}</div>
          <div>speaker: {speakerRatio == null ? "—" : speakerRatio.toFixed(3)}</div>
          <div>prompter: {currentRatio == null ? "—" : currentRatio.toFixed(3)}</div>
          <div>Δ: {lastDelta == null ? "—" : lastDelta.toFixed(3)}</div>
          <div>playing: {state.isPlaying ? "yes" : "no"}</div>
        </div>
      )}

      {/* Top-right controls: voice debug toggle + close */}
      <div
        className="absolute top-3 right-3 z-10 flex items-center gap-2"
        style={{ transform: counterTransform }}
      >
        {state.voiceFollowing && (
          <button
            type="button"
            onClick={() => setShowVoiceDebug((v) => !v)}
            className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold ${
              showVoiceDebug
                ? "bg-indigo-600 text-white"
                : "bg-black/70 text-white/80 hover:bg-black/90"
            }`}
            title="Toggle voice debug HUD (D)"
          >
            D
          </button>
        )}
        <button
          type="button"
          onClick={() => getCurrentWindow().close()}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white/90 hover:bg-red-600 hover:text-white"
          title="Close prompter (Esc)"
        >
          ×
        </button>
      </div>

      {/* Persistent transport bar (Elgato-style) */}
      <PrompterTransportBar
        isPlaying={state.isPlaying}
        voiceFollowing={state.voiceFollowing}
        voiceSyncActive={state.voiceSyncActive}
        showControls={showControls}
        currentChapter={totalChapters === 0 ? 0 : chapterIndex + 1}
        totalChapters={totalChapters}
        fontSize={state.fontSize}
        counterTransform={counterTransform}
        onPrevChapter={onPrevChapter}
        onNextChapter={onNextChapter}
      />
    </div>
  );
}
