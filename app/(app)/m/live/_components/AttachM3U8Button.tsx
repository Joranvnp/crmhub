"use client";
import { useState } from "react";

async function safeJson(res: Response) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try {
      return await res.json();
    } catch {}
  }
  const text = await res.text();
  return { _raw: text };
}

export default function AttachM3U8Button({ id }: { id: string }) {
  const [loading, setLoading] = useState(false);

  async function onClick() {
    setLoading(true);
    try {
      let clip = "";
      try {
        clip = await navigator.clipboard.readText();
      } catch {}
      const url = window.prompt("Colle l’URL .m3u8", clip || "");
      if (!url) return;

      // ⚠️ chemin ABSOLU
      const res = await fetch("/api/modules/live/attach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, m3u8: url }),
      });

      const data = await safeJson(res);
      if (!res.ok) {
        alert(
          `Erreur attach (${res.status}): ${
            data?.error || data?._raw || "unknown"
          }`
        );
        console.error("[attach]", res.status, data);
        return;
      }
      alert("Attach OK ✅");
      location.reload();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      className="px-3 py-1 rounded border"
      onClick={onClick}
      disabled={loading}
    >
      Attacher M3U8
    </button>
  );
}
