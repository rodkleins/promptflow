import { emit } from "@tauri-apps/api/event";

// Logs to console AND to the Rust backend's stderr via a `frontend:log` event.
// Use sparingly — this is a debug aid, not a production logging layer.
export function dlog(tag: string, ...parts: unknown[]) {
  const line = parts
    .map((p) => (typeof p === "object" ? JSON.stringify(p) : String(p)))
    .join(" ");
  const composed = `${tag} ${line}`;
  // eslint-disable-next-line no-console
  console.log(composed);
  emit("frontend:log", composed).catch(() => undefined);
}
