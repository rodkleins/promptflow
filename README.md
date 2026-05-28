# PromptFlow

A native, offline-first teleprompter for **macOS** and **Windows**. Rich-text scripts, multi-display output, mirror for teleprompter glass, scroll auto-pacing, and a built-in **mobile remote** controlled from any browser on the same Wi-Fi — no app to install.

Built with Tauri 2, React, and SQLite. ~20 MB binary, ~2 s cold start.

---

## Features

### Script editor
- Block-style rich-text editor (Tiptap) — paragraphs render as cards with draggable handles
- Auto-save (1 s debounce) into a local SQLite database
- Folders + search in the sidebar
- Bookmarks at the current cursor for jumping during playback
- **Import** TXT and DOCX, **export** TXT and DOCX
- Paragraphs containing blank-line groups are auto-split on load and on paste so wall-of-text scripts become clean blocks

### Teleprompter output
- Borderless, always-on-top window on any selected display (multi-monitor aware, HiDPI-correct)
- 60 fps `requestAnimationFrame` scroll engine with speed and font-size live controls
- Horizontal flip for camera-glass setups
- Rotation (0° / 90° / 180° / 270°), brightness, contrast — applied via CSS filters
- Read-position fade: text above the active reading line dims to draw the eye to the current line
- 3-2-1 countdown overlay before scroll starts
- Floating ⓧ close button + hint overlay that auto-hides after 3 s of mouse idle

### Mobile remote
- Built-in **Axum WebSocket server** on the local network
- Single static HTML mobile UI served from the binary — works in any phone browser
- QR-code enrollment from the desktop app
- Bidirectional bridge: phone controls play/pause/speed/font, app pushes state back to all connected clients
- Auto-reconnect on connection drop

### Persistence
- SQLite (`tauri-plugin-sql`) with migration runner — schema versioned
- Settings (font, colors, margins, line spacing, etc.) persist across launches
- All data lives in the OS app-data directory; nothing leaves the machine
- See [STORAGE.md](STORAGE.md) for exact paths, table schemas, settings keys, and backup/reset commands

### Keyboard shortcuts
Global — active even when the prompter window has focus:

| Action            | macOS         | Windows        |
| ----------------- | ------------- | -------------- |
| Play / Pause      | `Space`       | `Space`        |
| Speed +/−         | `↑` / `↓`     | `↑` / `↓`      |
| Font +/−          | `⌘ + / −`     | `Ctrl + / −`   |
| Restart           | `R`           | `R`            |
| Close prompter    | `Esc`         | `Esc`          |
| Quit prompter     | `⌘ Q`         | `Ctrl Q`       |

---

## Tech stack

| Layer            | Technology                                   |
| ---------------- | -------------------------------------------- |
| Desktop runtime  | Tauri 2 (Rust)                               |
| Frontend         | React 19 + TypeScript 5 + Vite 7             |
| Styling          | Tailwind CSS 3                               |
| Rich-text editor | Tiptap 3 (`@tiptap/react`, `starter-kit`)    |
| State            | Zustand 5                                    |
| Local DB         | SQLite via `tauri-plugin-sql`                |
| Remote server    | Axum 0.7 + Tokio (WebSocket + static assets) |
| Export / Import  | `docx`, `mammoth`                            |
| QR code          | `qrcode`                                     |

---

## Getting started

### Prerequisites
- **macOS 13+** (Intel + Apple Silicon) or **Windows 11**
- **Rust** stable (1.78+) — install via [rustup](https://rustup.rs/)
- **Node.js** 20+
- **pnpm** 9+ (`npm install -g pnpm`)
- macOS only: **Xcode Command Line Tools** (`xcode-select --install`)

### Install
```bash
git clone git@github.com:rodkleins/promptflow.git
cd promptflow
pnpm install
```

### Run (development)
```bash
pnpm tauri dev
```
First launch compiles ~500 Rust crates and takes a couple of minutes. Subsequent builds are seconds.

### Build a release binary
```bash
pnpm tauri build
```
Outputs:
- macOS: `src-tauri/target/release/bundle/dmg/PromptFlow_*.dmg`
- Windows: `src-tauri/target/release/bundle/msi/PromptFlow_*.msi`

### Build the Whisper sidecar (required for Voice Sync)
The whisper.cpp binary is not committed. Build it once per host with:
```bash
./scripts/build-whisper.sh
```
The script clones `whisper.cpp` into `src-tauri/sidecars/whisper/whisper.cpp/`, builds the
`whisper-cli` target, and installs it as `src-tauri/sidecars/whisper/whisper-<target-triple>`
where Tauri's `externalBin` resolver expects it. Requires `cmake` and a C++ toolchain.
The model file (`ggml-tiny.bin` or `ggml-base.bin`) is downloaded on demand from the
Settings → Voice Sync panel into `$APPDATA/promptflow/models/`.

---

## Project structure

```
promptflow/
├── src/                       # React frontend
│   ├── pages/
│   │   ├── Editor/            # Main editor window
│   │   └── Prompter/          # Teleprompter output window
│   ├── components/            # ScriptList, RichEditor, ControlBar, SettingsPanel,
│   │                          # Bookmarks, ImportExportMenu, RemotePanel, ErrorBoundary
│   ├── hooks/                 # useScroll, useAutosave, useSettings, useShortcuts,
│   │                          # usePrompterBridge, useRemote
│   ├── lib/                   # exporters, importers, normalizeBlocks
│   ├── store/prompter.ts      # Zustand store (settings + playback state)
│   └── db/client.ts           # SQLite CRUD wrapper
├── src-tauri/                 # Rust backend
│   ├── src/
│   │   ├── commands/          # display, voice_sync, remote
│   │   └── db/                # schema.sql + migrations
│   └── capabilities/          # Tauri 2 permissions
├── remote-ui/index.html       # Mobile remote (served from the binary)
└── promptflow-technical-prd.md
```

---

## Using the mobile remote

1. In the app, open **Settings → Remote → Enable remote**
2. Scan the QR code with your phone, or open the printed `http://LOCAL_IP:PORT` URL in any browser
3. Both devices must be on the same Wi-Fi network
4. Use the big Play/Pause, ± Speed, ± Font, and bookmark buttons — the connection status dot at the top shows live link health

---

## Roadmap

- **Phase 3 — Voice Sync** (planned): Whisper.cpp sidecar transcribes the microphone in real time and auto-paces the scroll to the speaker. On-demand model download (`ggml-tiny` 75 MB or `ggml-base` 142 MB) keeps the base bundle small.
- PDF export
- Folder hierarchies (currently flat)
- Theme presets (newsroom / podcast / cinema)
- Plug-and-play USB foot-pedal support

---

## License

Not yet declared. Pick one before publishing widely.

---

Built with the help of Claude Code.
