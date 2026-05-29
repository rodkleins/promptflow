import { emit, listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import { dlog } from "../lib/log";
import { usePrompter } from "../store/prompter";

type Json = { type?: string; text?: string; content?: Json[] };

function flattenText(node: Json | null | undefined): string {
  if (!node) return "";
  if (node.type === "text" && typeof node.text === "string") return node.text;
  if (!node.content) return "";
  return node.content
    .map((child) => flattenText(child))
    .join(node.type === "paragraph" || node.type === "heading" ? "\n" : " ");
}

const TOKEN_STRIP = /[^\p{L}\p{N}\s]/gu;
function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents — whisper is inconsistent with them
    .replace(TOKEN_STRIP, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// Lines whisper produces for non-speech audio — skip them.
const NOISE_TOKENS = new Set([
  "musica",
  "music",
  "silence",
  "inaudivel",
  "inaudible",
  "applause",
  "laughter",
  "noise",
  "blank_audio",
]);

// Phrases whisper famously hallucinates on silence/background noise. Matched
// against the joined tokenized transcript (lowercase, accent-stripped, single-
// spaced). Add new ones as they show up in `Live transcript`.
const HALLUCINATION_PHRASES = new Set([
  // pt-BR
  "muito bom",
  "muito obrigado",
  "muito obrigada",
  "obrigado",
  "obrigada",
  "tchau",
  "bom dia",
  "boa tarde",
  "boa noite",
  "vamos la",
  "ate logo",
  "ate mais",
  "mais ou menos",
  "para mais informacoes acesse www globo com",
  "inscreva se no canal",
  "deixa o like",
  "compartilhe o video",
  // en
  "thanks for watching",
  "thank you for watching",
  "please subscribe",
  "subscribe",
  "like and subscribe",
  "see you next time",
  "bye bye",
]);

function isNoise(words: string[]): boolean {
  if (words.length === 0) return true;
  if (words.every((w) => NOISE_TOKENS.has(w))) return true;
  if (HALLUCINATION_PHRASES.has(words.join(" "))) return true;
  return false;
}

const WINDOW_BEHIND = 10;
const WINDOW_AHEAD = 80;
const MIN_RUN = 2; // require at least 2 consecutive script words to match
const MAX_ADVANCE_PER_TICK = 30;

interface MatchResult {
  position: number;
  run: number;
  bestRunSeen: number;
}

function bestMatch(
  scriptWords: string[],
  cursor: number,
  transcriptWords: string[],
): MatchResult | null {
  const tLen = transcriptWords.length;
  if (tLen < 1 || scriptWords.length === 0) return null;
  const start = Math.max(0, cursor - WINDOW_BEHIND);
  const end = Math.min(scriptWords.length - 1, cursor + WINDOW_AHEAD);
  let bestRun = 0;
  let bestPos = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestRunSeen = 0; // diagnostic: max run found in window, even if below MIN_RUN

  for (let p = start; p <= end; p++) {
    let runHere = 0;
    for (let off = 0; off < tLen; off++) {
      let r = 0;
      while (
        off + r < tLen &&
        p + r < scriptWords.length &&
        scriptWords[p + r] === transcriptWords[off + r]
      ) {
        r++;
      }
      if (r > runHere) runHere = r;
    }
    if (runHere > bestRunSeen) bestRunSeen = runHere;
    // Distance-scaled minimum run length: a match that's far ahead of the
    // cursor must be more compelling (longer consecutive run) to be accepted,
    // so coincidental short matches on common filler words ("para o", "e o",
    // "que a") can't drag the cursor across the script. With divisor=15:
    //   run=2 → 0-14 words ahead, run=3 → 0-29, run=4 → 0-44, etc.
    // Behind-cursor matches use the base MIN_RUN.
    const aheadDist = Math.max(0, p - cursor);
    const requiredRun = MIN_RUN + Math.floor(aheadDist / 15);
    if (runHere < requiredRun) continue;
    const distance = Math.abs(p - cursor);
    if (runHere > bestRun || (runHere === bestRun && distance < bestDistance)) {
      bestRun = runHere;
      bestPos = p;
      bestDistance = distance;
    }
  }
  if (bestPos < 0) {
    return { position: cursor, run: 0, bestRunSeen };
  }
  const advancedTo = bestPos + bestRun;
  const capped = Math.min(advancedTo, cursor + MAX_ADVANCE_PER_TICK);
  return { position: capped, run: bestRun, bestRunSeen };
}

export function useVoicePacing() {
  const activeScriptId = usePrompter((s) => s.activeScriptId);
  const scripts = usePrompter((s) => s.scripts);
  const prompterOpen = usePrompter((s) => s.prompterOpen);
  const voiceActive = usePrompter((s) => s.voiceSyncActive);
  const voiceFollow = usePrompter((s) => s.voiceFollow);

  const scriptWordsRef = useRef<string[]>([]);
  const cursorRef = useRef(0);

  // Rebuild the token array when the active script content changes.
  useEffect(() => {
    if (!activeScriptId) {
      scriptWordsRef.current = [];
      cursorRef.current = 0;
      return;
    }
    const script = scripts.find((s) => s.id === activeScriptId);
    if (!script) return;
    try {
      const json: Json = JSON.parse(script.content);
      const text = flattenText(json);
      scriptWordsRef.current = tokenize(text);
      dlog("[voice-pacing/editor]",
        "[voice-pacing] script tokenized:",
        scriptWordsRef.current.length,
        "words. First 8:",
        scriptWordsRef.current.slice(0, 8).join(" "),
      );
    } catch (e) {
      console.warn("[voice-pacing] script JSON parse failed", e);
      scriptWordsRef.current = [];
    }
    cursorRef.current = 0;
  }, [activeScriptId, scripts]);

  // Reset cursor whenever a new prompter session starts.
  useEffect(() => {
    if (prompterOpen && voiceActive) {
      cursorRef.current = 0;
      dlog("[voice-pacing/editor]","[voice-pacing] cursor reset (prompter+voice active)");
    }
  }, [prompterOpen, voiceActive]);

  // Subscribe to transcripts only while voice-following.
  useEffect(() => {
    dlog("[voice-pacing/editor]", "subscription gate", {
      voiceActive,
      voiceFollow,
      prompterOpen,
    });
    if (!voiceActive || !voiceFollow || !prompterOpen) return;
    const promise = listen<{ text: string }>("voice:transcript", (e) => {
      const raw = e.payload.text.trim();
      // Whisper wraps non-speech audio in brackets: [música], [MÚSICA DE FUNDO], (laughter), etc.
      if (raw.startsWith("[") || raw.startsWith("(")) {
        dlog("[voice-pacing/editor]", "skipped annotation:", raw);
        return;
      }
      const words = tokenize(raw);
      dlog("[voice-pacing/editor]","[voice-pacing] transcript:", raw, "→ tokens:", words);
      if (isNoise(words)) {
        dlog("[voice-pacing/editor]","[voice-pacing] skipped (noise)");
        return;
      }
      if (scriptWordsRef.current.length === 0) {
        dlog("[voice-pacing/editor]", "no script tokens loaded");
        return;
      }
      const m = bestMatch(scriptWordsRef.current, cursorRef.current, words);
      if (!m || m.run === 0) {
        dlog("[voice-pacing/editor]",
          "[voice-pacing] no match (need run≥",
          MIN_RUN,
          "). best run seen=",
          m?.bestRunSeen ?? 0,
          " cursor=",
          cursorRef.current,
          " window=[",
          Math.max(0, cursorRef.current - WINDOW_BEHIND),
          ",",
          Math.min(scriptWordsRef.current.length - 1, cursorRef.current + WINDOW_AHEAD),
          "] script-slice:",
          scriptWordsRef.current
            .slice(
              Math.max(0, cursorRef.current - 2),
              Math.min(scriptWordsRef.current.length, cursorRef.current + 12),
            )
            .join(" "),
        );
        return;
      }
      cursorRef.current = m.position;
      const ratio = Math.min(1, m.position / scriptWordsRef.current.length);
      // wordIndex points at the LAST matched word so the prompter highlights what the speaker just said.
      const wordIndex = Math.max(0, m.position - 1);
      dlog("[voice-pacing/editor]",
        "[voice-pacing] MATCH run=",
        m.run,
        "cursor→",
        m.position,
        "ratio=",
        ratio.toFixed(3),
        "wordIdx=",
        wordIndex,
      );
      emit("prompter:voice-pos", { ratio, wordIndex }).catch((err) =>
        console.warn("[voice-pacing] emit failed", err),
      );
    });
    return () => {
      promise.then((f) => f()).catch(() => undefined);
    };
  }, [voiceActive, voiceFollow, prompterOpen]);
}
