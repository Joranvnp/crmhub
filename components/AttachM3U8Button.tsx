"use client";
import { useTransition } from "react";

export default function AttachM3U8Button({
  id,
  onUpdated,
}: {
  id: string;
  onUpdated: (row: any) => void;
}) {
  const [pending, start] = useTransition();

  async function run() {
    let clip = "";
    try {
      clip = await navigator.clipboard.readText();
    } catch {}
    const url = window.prompt("Colle l’URL .m3u8", clip || "");
    if (!url) return;
    const res = await fetch("/api/modules/live/attach-m3u8", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, m3u8: url }),
    });
    const json = await res.json();
    if (!res.ok) {
      alert("Erreur: " + (json?.error || res.status));
      return;
    }
    onUpdated(json.data);
  }

  return (
    <button
      className="px-3 py-1 rounded border"
      onClick={() => start(() => run())}
      disabled={pending}
    >
      Attacher M3U8
    </button>
  );
}
