"use client";
import { useState } from "react";

function pickBestByScore(list: string[]): string {
  const score = (u: string) => {
    let s = 0;
    if (/playlist\.m3u8/i.test(u)) s += 3;
    if (/master\.m3u8/i.test(u)) s += 2;
    if (/chunklist|index\.m3u8/i.test(u)) s += 1;
    if (/^https?:\/\//i.test(u)) s += 1;
    return s;
  };
  const arr = [...list];
  arr.sort((a, b) => score(b) - score(a));
  return arr[0];
}

function extractM3u8FromText(t: string): string | null {
  if (!t) return null;

  // 1) vrai .m3u8 dans le blob
  const exact = Array.from(
    t.matchAll(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/gi)
  ).map((m) => m[0]);
  if (exact.length) return pickBestByScore(exact);

  // 2) URLs sans extension mais master/playlist/index → ajouter .m3u8
  const urls = Array.from(t.matchAll(/https?:\/\/[^\s"'<>]+/gi)).map(
    (m) => m[0]
  );
  const repaired: string[] = [];
  for (let u of urls) {
    u = u.replace(/[)"'<>]+$/g, "");
    if (
      !/\.m3u8(\?|#|$)/i.test(u) &&
      /(master|playlist|index)(\?|#|$)/i.test(u)
    ) {
      repaired.push(u.replace(/(\?|#|$)/, ".m3u8$1"));
    }
  }
  if (repaired.length) return pickBestByScore(repaired);

  // 3) segments .ts → hypothèse playlist
  const ts = Array.from(
    t.matchAll(/https?:\/\/[^\s"'<>]+\/[^\s"'<>]+\.ts[^\s"'<>]*/gi)
  ).map((m) => m[0]);
  if (ts.length)
    return ts[0].replace(/\/[^\/]*\.ts[^\s"'<>]*/, "/playlist.m3u8");

  return null;
}

const isStrictM3u8 = (u?: string | null) => !!u && /\.m3u8(\?|#|$)/i.test(u);

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

  async function attach(url: string) {
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
      return false;
    }
    alert("Attach OK ✅");
    location.reload();
    return true;
  }

  async function onClick() {
    if (loading) return;
    setLoading(true);
    try {
      // 1) lire le clipboard
      let raw = "";
      try {
        raw = await navigator.clipboard.readText();
      } catch {}

      // 2) si clipboard est STRICT .m3u8 → attache direct
      if (isStrictM3u8(raw)) {
        const candidate = extractM3u8FromText(raw) || raw;
        if (isStrictM3u8(candidate)) {
          await attach(candidate);
          return;
        }
      }

      // 3) sinon : proposer une invite préremplie avec une version réparée si possible
      const suggested = extractM3u8FromText(raw) || raw || "";
      const entered = window.prompt("Colle l’URL .m3u8", suggested) || "";
      if (!entered) return;

      // 4) on réévalue l'entrée utilisateur ; on exige .m3u8 strict
      const fixed = extractM3u8FromText(entered) || entered;
      if (!isStrictM3u8(fixed)) {
        alert("Le lien doit se terminer par .m3u8. Réessaie.");
        return;
      }

      await attach(fixed);
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
