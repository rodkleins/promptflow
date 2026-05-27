import QRCode from "qrcode";
import { useEffect, useRef } from "react";
import { useRemote } from "../../hooks/useRemote";

export function RemotePanel() {
  const { info, error, start, stop } = useRemote();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!info || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, info.url, {
      width: 192,
      margin: 1,
      color: { dark: "#FFFFFF", light: "#0A0A0A" },
    }).catch(console.error);
  }, [info]);

  if (!info) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-neutral-400">
          Control PromptFlow from your phone over Wi-Fi. Scan a QR code to open the
          remote in a browser — no app to install.
        </p>
        <button
          type="button"
          onClick={start}
          className="w-full rounded bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Enable remote
        </button>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-center">
        <canvas ref={canvasRef} className="rounded border border-neutral-700" />
      </div>
      <div className="rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-center font-mono text-xs text-neutral-300">
        {info.url}
      </div>
      <p className="text-[11px] text-neutral-500">
        Both devices must be on the same Wi-Fi network.
      </p>
      <button
        type="button"
        onClick={stop}
        className="w-full rounded border border-red-900/60 px-3 py-1 text-xs text-red-400 hover:bg-red-900/30"
      >
        Disable remote
      </button>
    </div>
  );
}
