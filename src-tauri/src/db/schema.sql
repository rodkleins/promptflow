-- Scripts library
CREATE TABLE IF NOT EXISTS scripts (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  folder_id   TEXT REFERENCES folders(id),
  word_count  INTEGER DEFAULT 0,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Script folders
CREATE TABLE IF NOT EXISTS folders (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  parent_id   TEXT REFERENCES folders(id),
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Bookmarks within a script
CREATE TABLE IF NOT EXISTS bookmarks (
  id          TEXT PRIMARY KEY,
  script_id   TEXT NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  char_offset INTEGER NOT NULL
);

-- App settings (key-value)
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL
);

INSERT OR IGNORE INTO settings VALUES
  ('font_size', '48'),
  ('scroll_speed', '1.5'),
  ('text_color', '#FFFFFF'),
  ('bg_color', '#000000'),
  ('margin_horizontal', '15'),
  ('countdown_seconds', '3'),
  ('voice_sync_enabled', 'false'),
  ('voice_sync_language', 'pt'),
  ('mirror_horizontal', 'true');
