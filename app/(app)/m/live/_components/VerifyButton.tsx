"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/** ————— Helpers “m3u8” ————— */
function extractM3u8FromText(t: string): string | null {
  if (!t) return null;
  const re = /https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/gi;
  const all = Array.from(t.matchAll(re)).map((m) => m[0]);
  if (!all.length) return null;

  // score: playlist > master > chunk/index > https
  const score = (u: string) => {
    let s = 0;
    if (/playlist\.m3u8/i.test(u)) s += 3;
    if (/master\.m3u8/i.test(u)) s += 2;
    if (/chunklist|index\.m3u8/i.test(u)) s += 1;
    if (/^https?:\/\//i.test(u)) s += 1;
    return s;
  };
  all.sort((a, b) => score(b) - score(a));
  return all[0];
}

function deriveMasterOrPlaylist(u: string): string[] {
  const s = new Set<string>([
    u,
    u.replace(/chunklist[^/]*\.m3u8/i, "playlist.m3u8"),
    u.replace(/chunklist[^/]*\.m3u8/i, "master.m3u8"),
    u.replace(/index[^/]*\.m3u8/i, "playlist.m3u8"),
    u.replace(/index[^/]*\.m3u8/i, "master.m3u8"),
  ]);
  return [...s].filter((x) => /\.m3u8(\?|#|$)/i.test(x));
}

function normalizeCandidate(raw: string): string | null {
  const trimmed = (raw || "").trim();
  if (!trimmed) return null;

  // Si le presse-papiers contient des logs/du texte → extraire la première vraie .m3u8
  const fromBlob = extractM3u8FromText(trimmed);
  const base = fromBlob || trimmed;

  if (!/\.m3u8(\?|#|$)/i.test(base)) return null; // on exige une .m3u8

  // si c’est un chunk/index, on préfère générer une playlist/master voisine
  const candidates = deriveMasterOrPlaylist(base);
  // re-score comme plus haut
  const score = (u: string) => {
    let s = 0;
    if (/playlist\.m3u8/i.test(u)) s += 3;
    if (/master\.m3u8/i.test(u)) s += 2;
    if (/chunklist|index\.m3u8/i.test(u)) s += 1;
    if (/^https?:\/\//i.test(u)) s += 1;
    return s;
  };
  candidates.sort((a, b) => score(b) - score(a));
  return candidates[0] || base;
}

/** Saisie manuelle d’un .m3u8 (UI inchangée) */
function AttachM3U8Inline({ id, onDone }: { id: string; onDone: () => void }) {
  const [pending, start] = useTransition();
  const [val, setVal] = useState("");

  async function run() {
    let candidate = normalizeCandidate(val);
    if (!candidate) {
      alert("Je ne trouve pas de .m3u8 valable dans ce que tu as collé.");
      return;
    }

    const r = await fetch("/api/modules/live/attach", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, m3u8: candidate }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      alert("Erreur attach: " + (j?.error || r.status));
      return;
    }
    onDone();
  }

  async function pasteFromClipboard() {
    try {
      const t = await navigator.clipboard.readText();
      const fixed = normalizeCandidate(t) || t;
      setVal(fixed);
    } catch {
      // pas d’accès presse-papiers → ne rien casser
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="https://.../playlist.m3u8"
        className="border rounded px-2 py-1 flex-1"
      />
      <button
        onClick={pasteFromClipboard}
        className="px-2 py-1 rounded border text-sm"
      >
        Coller
      </button>
      <button
        onClick={() => start(run)}
        disabled={pending || !val}
        className="px-3 py-1 rounded bg-black text-white text-sm"
      >
        Attacher
      </button>
    </div>
  );
}

export default function VerifyButton({
  id,
  url,
  probeToken,
}: {
  id: string;
  url: string;
  probeToken: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const endpoint =
    typeof window !== "undefined"
      ? `${location.origin}/api/modules/live/probe-collect`
      : "";

  /** ——— Ton snippet/Bookmarklet/TM restent inchangés ici ——— */
  const QUALITY_AUTOPROBE_SNIPPET = useMemo(() => {
    // garde ta version actuelle ici (je n’y touche pas)
    return "";
  }, []);

  const bookmarklet = useMemo(
    () => `javascript:${encodeURIComponent(QUALITY_AUTOPROBE_SNIPPET)}`,
    [QUALITY_AUTOPROBE_SNIPPET]
  );

  async function verifyAsync() {
    try {
      const r = await fetch(
        `/api/modules/live/check?id=${encodeURIComponent(id)}`,
        { method: "POST" }
      );
      const text = await r.text();
      let j: any = {};
      try {
        j = text ? JSON.parse(text) : {};
      } catch {
        j = { raw: text };
      }
      if (!r.ok) {
        alert(
          `Erreur check (${r.status}): ${
            j?.detail || j?.error || text || r.status
          }`
        );
        return;
      }
      const st = j?.data?.status;
      const m3u8 = j?.data?.last_m3u8 || null;
      if (st === "online" && m3u8) {
        router.refresh();
      } else {
        setOpen(true);
      }
    } catch (e: any) {
      alert("Network error: " + (e?.message || e));
    }
  }

  const tmLink = useMemo(() => {
    const cfg = { endpoint, link_id: id, probe_token: probeToken };
    const b64 =
      typeof window === "undefined"
        ? ""
        : btoa(unescape(encodeURIComponent(JSON.stringify(cfg))));
    return `${url}#crmhub_probe=${b64}`;
  }, [endpoint, id, probeToken, url]);

  return (
    <>
      <button
        className="px-3 py-1 rounded border"
        onClick={() => start(() => void verifyAsync())}
        disabled={pending}
      >
        Vérifier
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-white rounded-xl p-4 w-full max-w-lg space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Récupérer le lien .m3u8</h3>
              <button className="text-sm" onClick={() => setOpen(false)}>
                Fermer
              </button>
            </div>

            <p className="text-sm text-gray-700">
              Ouvre l’onglet du live{" "}
              <span className="font-mono break-all">{url}</span>, clique ▶️,
              puis :
            </p>

            <div className="flex items-center gap-2">
              <a
                href={bookmarklet}
                className="px-3 py-1 rounded bg-black text-white text-sm"
                title="Glisse d'abord dans ta barre de favoris, puis clique-le depuis l'onglet du live"
              >
                🔖 Probe (one-shot)
              </a>
              <button
                onClick={() =>
                  navigator.clipboard
                    .writeText(QUALITY_AUTOPROBE_SNIPPET)
                    .then(() => alert("Snippet (probe) copié ✅"))
                }
                className="px-3 py-1 rounded border text-sm"
              >
                Copier le snippet 8s
              </button>
            </div>

            <div className="text-sm text-gray-700 space-y-2 pt-2 border-t">
              <div className="font-medium">Option (avec Tampermonkey)</div>
              <ol className="list-decimal ml-5 space-y-1 text-xs text-gray-600">
                <li>
                  Installe l’userscript :{" "}
                  <a
                    className="underline"
                    href="/userscript/crmhub-autoprobe.user.js"
                    target="_blank"
                  >
                    /userscript/crmhub-autoprobe.user.js
                  </a>
                </li>
                <li>Ouvre le lien auto-probe (ou copie-le) :</li>
              </ol>
              <div className="flex items-center gap-2">
                <a
                  href={tmLink}
                  target="_blank"
                  className="px-3 py-1 rounded bg-indigo-600 text-white text-sm"
                >
                  Ouvrir le lien auto-probe
                </a>
                <button
                  onClick={() =>
                    navigator.clipboard
                      .writeText(tmLink)
                      .then(() => alert("Lien auto-probe copié ✅"))
                  }
                  className="px-3 py-1 rounded border text-sm"
                >
                  Copier le lien
                </button>
              </div>
            </div>

            <div className="pt-3 border-t">
              <AttachM3U8Inline
                id={id}
                onDone={() => {
                  setOpen(false);
                  router.refresh();
                }}
              />
            </div>

            <p className="text-xs text-gray-500">
              (Les navigateurs empêchent d’exécuter un script sur un autre site
              sans action explicite.)
            </p>
          </div>
        </div>
      )}
    </>
  );
}
