# PromptFlow — Storage & Data Locations

This document describes everything PromptFlow writes to disk, where it lives, and
how to inspect / back up / reset it. Useful when you switch machines, debug a
"why does my data look stale" issue, or want to ship a clean release.

PromptFlow is **offline-first**: nothing leaves the machine. The same data
directory is shared by both the development build (`pnpm tauri dev`) and the
installed app bundle because both ship with the Tauri identifier
`com.promptflow.app`.

---

## Where the data lives

PromptFlow resolves its data directory at runtime via Tauri's
`app.path().app_data_dir()`. That returns the OS-conventional per-app data path,
keyed by the bundle identifier `com.promptflow.app`.

| OS      | Data directory                                                              |
|---------|-----------------------------------------------------------------------------|
| macOS   | `~/Library/Application Support/com.promptflow.app/`                         |
| Windows | `%APPDATA%\com.promptflow.app\` (typically `C:\Users\<you>\AppData\Roaming\com.promptflow.app\`) |
| Linux   | `$XDG_DATA_HOME/com.promptflow.app/` (falls back to `~/.local/share/com.promptflow.app/`) |

Open the directory on macOS:
```bash
open ~/Library/Application\ Support/com.promptflow.app
```

---

## Contents of the data directory

```
com.promptflow.app/
├── promptflow.db        # SQLite database (scripts, folders, bookmarks, settings)
└── models/
    ├── ggml-tiny.bin    # Whisper tiny model (~75 MB) — downloaded on demand
    └── ggml-base.bin    # Whisper base model (~142 MB) — downloaded on demand
```

### `promptflow.db` (SQLite)

Created and managed by [`tauri-plugin-sql`](https://v2.tauri.app/plugin/sql/).
Migrations live in
[`src-tauri/src/db/`](src-tauri/src/db/) and are applied automatically on first
launch and after upgrades.

**Tables (current schema, migrations 001–004):**

| Table       | What it stores                                                                                    |
|-------------|---------------------------------------------------------------------------------------------------|
| `scripts`   | One row per script: `id`, `title`, `content` (Tiptap JSON or HTML), `folder_id`, `word_count`, timestamps. |
| `folders`   | Sidebar folders for organizing scripts: `id`, `name`, `parent_id`, `created_at`.                  |
| `bookmarks` | Per-script bookmarks: `id`, `script_id`, `label`, `char_offset`.                                  |
| `settings`  | Key/value preference store. See **Settings keys** below.                                          |

**Settings keys** (kept in sync with `SETTING_KEYS` in
[`src/hooks/useSettings.ts`](src/hooks/useSettings.ts)):

| DB key                     | UI control                                       | Type    | Default     |
|----------------------------|--------------------------------------------------|---------|-------------|
| `font_size`                | Settings → Appearance → Font size                | number  | `48`        |
| `font_family`              | Settings → Appearance → Font                     | string  | system UI   |
| `text_color`               | Settings → Appearance → Text                     | hex     | `#FFFFFF`   |
| `bg_color`                 | Settings → Appearance → Background               | hex     | `#000000`   |
| `margin_horizontal`        | Settings → Appearance → Horizontal margin        | number  | `15`        |
| `vertical_margin`          | Settings → Appearance → Vertical margin          | number  | `50`        |
| `line_spacing`             | Settings → Appearance → Line spacing             | number  | `140`       |
| `brightness`               | Settings → Display → Brightness                  | number  | `100`       |
| `contrast`                 | Settings → Display → Contrast                    | number  | `100`       |
| `orientation_deg`          | Settings → Display → Orientation                 | number  | `0`         |
| `mirror_horizontal`        | Settings → Display → Horizontal flip             | boolean | `true`      |
| `scroll_speed`             | Settings → Playback → Scroll speed               | number  | `1.5`       |
| `countdown_seconds`        | Settings → Playback → Countdown                  | number  | `3`         |
| `text_opacity`             | Settings → Appearance → Text opacity             | number  | `100`       |
| `auto_loop`                | Settings → Playback → Auto-loop                  | boolean | `false`     |
| `reading_line_position`    | Settings → Appearance → Reading line             | number  | `50`        |
| `voice_sync_language`      | Voice Sync → Language                            | string  | `pt`        |
| `voice_sync_model`         | Voice Sync → Model                               | string  | `tiny`      |
| `voice_follow`             | Voice Sync → Follow voice toggle                 | boolean | `true`      |
| `voice_silence_behavior`   | Voice Sync → On silence                          | enum    | `slow`      |

### `models/` (Whisper)

Downloaded on demand from HuggingFace
(`https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-<name>.bin`)
the first time you click **Download {model}** in the Voice Sync panel.

| File                  | Size     | Notes                                                   |
|-----------------------|----------|---------------------------------------------------------|
| `ggml-tiny.bin`       | ~75 MB   | Faster, less accurate. Default model.                   |
| `ggml-base.bin`       | ~142 MB  | More accurate, ~2× slower.                              |

Download progress is reported via the `voice:download-progress` Tauri event;
the file is written to `models/ggml-<name>.bin.partial` first and atomically
renamed when complete, so an interrupted download leaves no half-installed file
in the way of a retry.

---

## What's *not* stored

- **The whisper.cpp sidecar binary** ships with the app bundle
  (`src-tauri/sidecars/whisper/whisper-<target-triple>`). It's built locally
  via [`scripts/build-whisper.sh`](scripts/build-whisper.sh) and packaged by
  Tauri at release time. It is **not** in the user data directory.
- **Per-script content** lives in `promptflow.db` as Tiptap JSON (or HTML for
  imported documents), not as individual files on disk.
- **No telemetry, no analytics, no cloud sync.** Nothing is ever sent off the
  machine.

---

## Common operations

### Inspect the database
```bash
sqlite3 ~/Library/Application\ Support/com.promptflow.app/promptflow.db \
  "SELECT id, title, word_count FROM scripts ORDER BY updated_at DESC LIMIT 10;"
```

### Back up everything
```bash
cp -R ~/Library/Application\ Support/com.promptflow.app \
      ~/Desktop/promptflow-backup-$(date +%Y%m%d)
```

### Restore from a backup
Quit PromptFlow first, then:
```bash
rm -rf ~/Library/Application\ Support/com.promptflow.app
cp -R ~/Desktop/promptflow-backup-YYYYMMDD \
      ~/Library/Application\ Support/com.promptflow.app
```

### Reset to a clean state
Quit PromptFlow first, then:
```bash
rm -rf ~/Library/Application\ Support/com.promptflow.app
```
The next launch will recreate `promptflow.db` with empty tables and seeded
defaults. You will need to re-download Whisper models.

### Free up disk space without losing scripts
Delete just the models — they'll re-download on next use:
```bash
rm -rf ~/Library/Application\ Support/com.promptflow.app/models
```

---

## Dev vs production

Both the development build (`pnpm tauri dev`) and the installed `.app` bundle
share the same identifier `com.promptflow.app`, so they share the same data
directory by design — useful for iterating, but it means test data in dev mixes
with your real scripts in prod.

To isolate them, give dev a separate identifier in `src-tauri/tauri.conf.json`
(e.g. `com.promptflow.app.dev`) or maintain a separate `tauri.dev.conf.json`.
