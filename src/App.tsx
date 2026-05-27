import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { listFolders, listScripts, loadDb } from "./db/client";
import { EditorPage } from "./pages/Editor";
import { PrompterPage } from "./pages/Prompter";
import { usePrompter } from "./store/prompter";

function detectMode() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("prompter") === "1") {
    return { mode: "prompter" as const, scriptId: params.get("scriptId") ?? "" };
  }
  return { mode: "editor" as const };
}

function App() {
  const setScripts = usePrompter((s) => s.setScripts);
  const setFolders = usePrompter((s) => s.setFolders);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const route = useMemo(detectMode, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadDb();
        if (route.mode === "editor") {
          const [scripts, folders] = await Promise.all([listScripts(), listFolders()]);
          if (cancelled) return;
          setScripts(scripts);
          setFolders(folders);
        }
        if (!cancelled) setReady(true);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setScripts, setFolders, route.mode]);

  if (error) {
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-neutral-950 p-8 text-red-400">
        <pre className="whitespace-pre-wrap text-sm">DB error: {error}</pre>
      </main>
    );
  }

  if (!ready) {
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-neutral-950 text-neutral-500">
        Loading…
      </main>
    );
  }

  if (route.mode === "prompter") {
    return <PrompterPage scriptId={route.scriptId} />;
  }

  return (
    <main className="h-screen w-screen bg-neutral-950 text-neutral-100">
      <EditorPage />
    </main>
  );
}

export default App;
