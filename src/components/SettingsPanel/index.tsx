import { type ReactNode, useState } from "react";
import { usePrompter } from "../../store/prompter";
import { RemotePanel } from "../RemotePanel";
import { VoiceSyncPanel } from "../VoiceSyncPanel";

const FONT_FAMILIES: { label: string; value: string }[] = [
  { label: "System", value: 'system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif' },
  { label: "Helvetica", value: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Georgia", value: 'Georgia, "Times New Roman", serif' },
  { label: "Times", value: '"Times New Roman", Times, serif' },
  { label: "Courier", value: '"Courier New", Courier, monospace' },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
];

const ORIENTATIONS = [
  { label: "Standard", value: 0 },
  { label: "Rotated 90°", value: 90 },
  { label: "Inverted", value: 180 },
  { label: "Rotated 270°", value: 270 },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="border-b border-neutral-800">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold tracking-wide text-neutral-400 uppercase hover:text-neutral-200"
      >
        <span>▸ {title}</span>
        <span className="text-neutral-600">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="space-y-3 px-3 pb-3">{children}</div>}
    </section>
  );
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}

function Slider({ label, value, min, max, step = 1, unit, onChange }: SliderProps) {
  return (
    <label className="block">
      <div className="flex items-center justify-between text-xs text-neutral-400">
        <span>{label}</span>
        <span className="text-neutral-200">
          {value}
          {unit ?? ""}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-indigo-500"
      />
    </label>
  );
}

export function SettingsPanel() {
  const s = usePrompter();
  const apply = s.applySettings;

  return (
    <aside className="flex h-full w-72 flex-col overflow-y-auto border-r border-neutral-800 bg-neutral-900">
      <div className="border-b border-neutral-800 px-3 py-2">
        <h2 className="text-xs font-semibold tracking-wide text-neutral-400 uppercase">
          Settings
        </h2>
      </div>

      <Section title="Display">
        <label className="block">
          <span className="text-xs text-neutral-400">Orientation</span>
          <select
            value={s.orientationDeg}
            onChange={(e) => apply({ orientationDeg: Number(e.target.value) })}
            className="mt-1 w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-sm text-neutral-200"
          >
            {ORIENTATIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center justify-between text-xs text-neutral-400">
          <span>Horizontal flip (mirror)</span>
          <input
            type="checkbox"
            checked={s.isMirrored}
            onChange={(e) => apply({ isMirrored: e.target.checked })}
            className="accent-indigo-500"
          />
        </label>

        <Slider
          label="Brightness"
          value={s.brightness}
          min={20}
          max={150}
          unit="%"
          onChange={(v) => apply({ brightness: v })}
        />
        <Slider
          label="Contrast"
          value={s.contrast}
          min={20}
          max={200}
          unit="%"
          onChange={(v) => apply({ contrast: v })}
        />
      </Section>

      <Section title="Appearance">
        <label className="block">
          <span className="text-xs text-neutral-400">Font</span>
          <select
            value={s.fontFamily}
            onChange={(e) => apply({ fontFamily: e.target.value })}
            className="mt-1 w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-sm text-neutral-200"
          >
            {FONT_FAMILIES.map((f) => (
              <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                {f.label}
              </option>
            ))}
          </select>
        </label>

        <Slider
          label="Font size"
          value={s.fontSize}
          min={24}
          max={140}
          step={2}
          unit="px"
          onChange={(v) => apply({ fontSize: v })}
        />
        <Slider
          label="Horizontal margin"
          value={s.marginHorizontal}
          min={0}
          max={40}
          unit="%"
          onChange={(v) => apply({ marginHorizontal: v })}
        />
        <Slider
          label="Vertical margin"
          value={s.marginVertical}
          min={0}
          max={50}
          unit="%"
          onChange={(v) => apply({ marginVertical: v })}
        />
        <Slider
          label="Line spacing"
          value={s.lineSpacing}
          min={100}
          max={250}
          unit="%"
          onChange={(v) => apply({ lineSpacing: v })}
        />
        <Slider
          label="Text opacity"
          value={s.textOpacity}
          min={10}
          max={100}
          unit="%"
          onChange={(v) => apply({ textOpacity: v })}
        />
        <Slider
          label="Reading line"
          value={s.readingLinePosition}
          min={10}
          max={90}
          unit="% from top"
          onChange={(v) => apply({ readingLinePosition: v })}
        />

        <div className="flex gap-2">
          <label className="flex-1">
            <span className="text-xs text-neutral-400">Text</span>
            <input
              type="color"
              value={s.textColor}
              onChange={(e) => apply({ textColor: e.target.value })}
              className="mt-1 h-8 w-full rounded border border-neutral-800 bg-neutral-900"
            />
          </label>
          <label className="flex-1">
            <span className="text-xs text-neutral-400">Background</span>
            <input
              type="color"
              value={s.bgColor}
              onChange={(e) => apply({ bgColor: e.target.value })}
              className="mt-1 h-8 w-full rounded border border-neutral-800 bg-neutral-900"
            />
          </label>
        </div>
      </Section>

      <Section title="Playback">
        <Slider
          label="Scroll speed"
          value={s.scrollSpeed}
          min={1}
          max={5}
          step={0.1}
          unit="×"
          onChange={(v) => apply({ scrollSpeed: v })}
        />
        <Slider
          label="Countdown"
          value={s.countdownSeconds}
          min={0}
          max={10}
          unit="s"
          onChange={(v) => apply({ countdownSeconds: v })}
        />
        <label className="flex items-center justify-between text-xs text-neutral-400">
          <span>Auto-loop (restart at end)</span>
          <input
            type="checkbox"
            checked={s.autoLoop}
            onChange={(e) => apply({ autoLoop: e.target.checked })}
            className="accent-indigo-500"
          />
        </label>
      </Section>

      <Section title="Voice Sync">
        <VoiceSyncPanel />
      </Section>

      <Section title="Remote">
        <RemotePanel />
      </Section>
    </aside>
  );
}
