import { useEffect, useRef } from "react";
import { loadAllSettings, saveSetting } from "../db/client";
import {
  DEFAULT_SETTINGS,
  type PrompterSettings,
  usePrompter,
} from "../store/prompter";

const SETTING_KEYS: Record<keyof PrompterSettings, string> = {
  fontSize: "font_size",
  fontFamily: "font_family",
  textColor: "text_color",
  bgColor: "bg_color",
  marginHorizontal: "margin_horizontal",
  marginVertical: "vertical_margin",
  lineSpacing: "line_spacing",
  brightness: "brightness",
  contrast: "contrast",
  orientationDeg: "orientation_deg",
  isMirrored: "mirror_horizontal",
  scrollSpeed: "scroll_speed",
  countdownSeconds: "countdown_seconds",
  textOpacity: "text_opacity",
  autoLoop: "auto_loop",
  readingLinePosition: "reading_line_position",
  voiceSyncLanguage: "voice_sync_language",
  voiceSyncModel: "voice_sync_model",
  voiceFollow: "voice_follow",
  voiceSilenceBehavior: "voice_silence_behavior",
};

function parseValue<K extends keyof PrompterSettings>(
  key: K,
  raw: string,
): PrompterSettings[K] {
  const def = DEFAULT_SETTINGS[key];
  if (typeof def === "number") return Number(raw) as PrompterSettings[K];
  if (typeof def === "boolean")
    return (raw === "true" || raw === "1") as PrompterSettings[K];
  return raw as PrompterSettings[K];
}

function serialize<K extends keyof PrompterSettings>(value: PrompterSettings[K]): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

/**
 * Loads settings from DB on mount, hydrates store, then persists every change
 * back to DB (debounced 250ms per key).
 */
export function useSettings() {
  const hydrated = useRef(false);
  const applySettings = usePrompter((s) => s.applySettings);

  useEffect(() => {
    (async () => {
      const raw = await loadAllSettings();
      const patch: Partial<PrompterSettings> = {};
      for (const [field, key] of Object.entries(SETTING_KEYS) as [
        keyof PrompterSettings,
        string,
      ][]) {
        const v = raw[key];
        if (v == null) continue;
        // @ts-expect-error indexed write into discriminated object
        patch[field] = parseValue(field, v);
      }
      applySettings(patch);
      hydrated.current = true;
    })().catch(console.error);
  }, [applySettings]);

  useEffect(() => {
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const unsub = usePrompter.subscribe((state, prev) => {
      if (!hydrated.current) return;
      for (const [field, key] of Object.entries(SETTING_KEYS) as [
        keyof PrompterSettings,
        string,
      ][]) {
        if (state[field] === prev[field]) continue;
        const existing = timers.get(key);
        if (existing) clearTimeout(existing);
        timers.set(
          key,
          setTimeout(() => {
            saveSetting(key, serialize(state[field])).catch(console.error);
          }, 250),
        );
      }
    });
    return () => {
      unsub();
      for (const t of timers.values()) clearTimeout(t);
    };
  }, []);
}
