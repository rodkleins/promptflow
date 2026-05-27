import { create } from "zustand";
import type { Folder, Script } from "../types";

export interface PrompterSettings {
  fontSize: number;
  fontFamily: string;
  textColor: string;
  bgColor: string;
  marginHorizontal: number; // %
  marginVertical: number; // % (top + bottom padding)
  lineSpacing: number; // % (line-height * 100)
  brightness: number; // %
  contrast: number; // %
  orientationDeg: number; // 0 | 90 | 180 | 270
  isMirrored: boolean;
  scrollSpeed: number;
  countdownSeconds: number;
}

interface PrompterState extends PrompterSettings {
  activeScriptId: string | null;
  scripts: Script[];
  folders: Folder[];

  isPlaying: boolean;
  currentPosition: number;

  targetDisplayId: number | null;

  voiceSyncActive: boolean;
  voiceSyncLanguage: string;

  remotePort: number | null;
  localIp: string | null;

  prompterOpen: boolean;
  setPrompterOpen: (open: boolean) => void;

  play: () => void;
  pause: () => void;
  setSpeed: (speed: number) => void;
  setFontSize: (size: number) => void;
  applySettings: (patch: Partial<PrompterSettings>) => void;

  setActiveScriptId: (id: string | null) => void;
  setScripts: (scripts: Script[]) => void;
  setFolders: (folders: Folder[]) => void;
  upsertScript: (script: Script) => void;
  removeScript: (id: string) => void;
  upsertFolder: (folder: Folder) => void;
  removeFolder: (id: string) => void;
  patchActiveScript: (patch: Partial<Script>) => void;
}

export const DEFAULT_SETTINGS: PrompterSettings = {
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
  scrollSpeed: 1.5,
  countdownSeconds: 3,
};

export const usePrompter = create<PrompterState>((set) => ({
  activeScriptId: null,
  scripts: [],
  folders: [],

  isPlaying: false,
  currentPosition: 0,

  ...DEFAULT_SETTINGS,

  targetDisplayId: null,

  voiceSyncActive: false,
  voiceSyncLanguage: "pt",

  remotePort: null,
  localIp: null,

  prompterOpen: false,
  setPrompterOpen: (prompterOpen) => set({ prompterOpen }),

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  setSpeed: (scrollSpeed) => set({ scrollSpeed }),
  setFontSize: (fontSize) => set({ fontSize }),
  applySettings: (patch) => set(patch),

  setActiveScriptId: (activeScriptId) => set({ activeScriptId }),
  setScripts: (scripts) => set({ scripts }),
  setFolders: (folders) => set({ folders }),
  upsertScript: (script) =>
    set((state) => {
      const exists = state.scripts.some((s) => s.id === script.id);
      return {
        scripts: exists
          ? state.scripts.map((s) => (s.id === script.id ? script : s))
          : [script, ...state.scripts],
      };
    }),
  removeScript: (id) =>
    set((state) => ({
      scripts: state.scripts.filter((s) => s.id !== id),
      activeScriptId: state.activeScriptId === id ? null : state.activeScriptId,
    })),
  upsertFolder: (folder) =>
    set((state) => {
      const exists = state.folders.some((f) => f.id === folder.id);
      return {
        folders: exists
          ? state.folders.map((f) => (f.id === folder.id ? folder : f))
          : [...state.folders, folder],
      };
    }),
  removeFolder: (id) =>
    set((state) => ({
      folders: state.folders.filter((f) => f.id !== id),
      scripts: state.scripts.map((s) =>
        s.folder_id === id ? { ...s, folder_id: null } : s,
      ),
    })),
  patchActiveScript: (patch) =>
    set((state) => {
      if (!state.activeScriptId) return {};
      return {
        scripts: state.scripts.map((s) =>
          s.id === state.activeScriptId ? { ...s, ...patch } : s,
        ),
      };
    }),
}));
