import Database from "@tauri-apps/plugin-sql";
import type { Bookmark, Folder, Script } from "../types";

const DB_URL = "sqlite:promptflow.db";

let dbPromise: Promise<Database> | null = null;

export function loadDb(): Promise<Database> {
  if (!dbPromise) dbPromise = Database.load(DB_URL);
  return dbPromise;
}

function newId(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function listFolders(): Promise<Folder[]> {
  const db = await loadDb();
  return db.select<Folder[]>("SELECT * FROM folders ORDER BY name ASC");
}

export async function createFolder(name: string, parentId: string | null = null): Promise<Folder> {
  const db = await loadDb();
  const folder: Folder = {
    id: newId(),
    name,
    parent_id: parentId,
    created_at: nowIso(),
  };
  await db.execute(
    "INSERT INTO folders (id, name, parent_id, created_at) VALUES ($1, $2, $3, $4)",
    [folder.id, folder.name, folder.parent_id, folder.created_at],
  );
  return folder;
}

export async function deleteFolder(id: string): Promise<void> {
  const db = await loadDb();
  await db.execute("UPDATE scripts SET folder_id = NULL WHERE folder_id = $1", [id]);
  await db.execute("DELETE FROM folders WHERE id = $1", [id]);
}

export async function listScripts(): Promise<Script[]> {
  const db = await loadDb();
  return db.select<Script[]>("SELECT * FROM scripts ORDER BY updated_at DESC");
}

export async function getScript(id: string): Promise<Script | null> {
  const db = await loadDb();
  const rows = await db.select<Script[]>("SELECT * FROM scripts WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function createScript(
  title: string,
  folderId: string | null = null,
): Promise<Script> {
  const db = await loadDb();
  const now = nowIso();
  const emptyDoc = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] });
  const script: Script = {
    id: newId(),
    title,
    content: emptyDoc,
    folder_id: folderId,
    word_count: 0,
    created_at: now,
    updated_at: now,
  };
  await db.execute(
    `INSERT INTO scripts (id, title, content, folder_id, word_count, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      script.id,
      script.title,
      script.content,
      script.folder_id,
      script.word_count,
      script.created_at,
      script.updated_at,
    ],
  );
  return script;
}

export interface ScriptUpdate {
  title?: string;
  content?: string;
  folder_id?: string | null;
  word_count?: number;
}

export async function updateScript(id: string, patch: ScriptUpdate): Promise<void> {
  const db = await loadDb();
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  for (const [key, value] of Object.entries(patch)) {
    fields.push(`${key} = $${idx++}`);
    values.push(value);
  }
  if (fields.length === 0) return;
  fields.push(`updated_at = $${idx++}`);
  values.push(nowIso());
  values.push(id);
  await db.execute(
    `UPDATE scripts SET ${fields.join(", ")} WHERE id = $${idx}`,
    values,
  );
}

export async function deleteScript(id: string): Promise<void> {
  const db = await loadDb();
  await db.execute("DELETE FROM scripts WHERE id = $1", [id]);
}

export async function loadAllSettings(): Promise<Record<string, string>> {
  const db = await loadDb();
  const rows = await db.select<{ key: string; value: string }[]>(
    "SELECT key, value FROM settings",
  );
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function saveSetting(key: string, value: string): Promise<void> {
  const db = await loadDb();
  await db.execute(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

export async function listBookmarks(scriptId: string): Promise<Bookmark[]> {
  const db = await loadDb();
  return db.select<Bookmark[]>(
    "SELECT * FROM bookmarks WHERE script_id = $1 ORDER BY char_offset ASC",
    [scriptId],
  );
}

export async function createBookmark(
  scriptId: string,
  label: string,
  charOffset: number,
): Promise<Bookmark> {
  const db = await loadDb();
  const bookmark: Bookmark = {
    id: newId(),
    script_id: scriptId,
    label,
    char_offset: charOffset,
  };
  await db.execute(
    "INSERT INTO bookmarks (id, script_id, label, char_offset) VALUES ($1, $2, $3, $4)",
    [bookmark.id, bookmark.script_id, bookmark.label, bookmark.char_offset],
  );
  return bookmark;
}

export async function deleteBookmark(id: string): Promise<void> {
  const db = await loadDb();
  await db.execute("DELETE FROM bookmarks WHERE id = $1", [id]);
}
