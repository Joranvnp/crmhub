"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/* ================= Helpers ================= */

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
  const re = /https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/gi;
  const exact = Array.from(t.matchAll(re)).map((m) => m[0]);
  if (exact.length) return pickBestByScore(exact);

  // 2) URLs sans extension mais master/playlist/index → ajouter .m3u8
  const urlLike = /https?:\/\/[^\s"'<>]+/gi;
  const urls = Array.from(t.matchAll(urlLike)).map((m) => m[0]);
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

function deriveMasterOrPlaylist(u: string): string[] {
  const addExtIfMissing = (s: string) =>
    /\.m3u8(\?|#|$)/i.test(s) || !/(master|playlist|index)(\?|#|$)/i.test(s)
      ? s
      : s.replace(/(\?|#|$)/, ".m3u8$1");

  const s = new Set<string>([
    addExtIfMissing(u),
    addExtIfMissing(u.replace(/chunklist[^/]*\.m3u8/i, "playlist.m3u8")),
    addExtIfMissing(u.replace(/chunklist[^/]*\.m3u8/i, "master.m3u8")),
    addExtIfMissing(u.replace(/index[^/]*\.m3u8/i, "playlist.m3u8")),
    addExtIfMissing(u.replace(/index[^/]*\.m3u8/i, "master.m3u8")),
  ]);
  return [...s].filter((x) => /\.m3u8(\?|#|$)/i.test(x));
}

function normalizeCandidate(raw: string): string | null {
  const trimmed = (raw || "").trim();
  if (!trimmed) return null;

  const fromBlob = extractM3u8FromText(trimmed);
  let ensured = fromBlob || trimmed;

  // tolère URL sans extension si master/playlist/index → ajoute .m3u8
  if (
    !/\.m3u8(\?|#|$)/i.test(ensured) &&
    /(master|playlist|index)(\?|#|$)/i.test(ensured)
  ) {
    ensured = ensured.replace(/(\?|#|$)/, ".m3u8$1");
  }
  if (!/\.m3u8(\?|#|$)/i.test(ensured)) return null;

  const candidates = deriveMasterOrPlaylist(ensured);
  return pickBestByScore(candidates.length ? candidates : [ensured]);
}

const isStrictM3u8 = (u?: string | null) => !!u && /\.m3u8(\?|#|$)/i.test(u);

/* ============== Attach inline (AUTO SEULEMENT SI CLIPBOARD STRICT) ============== */

function AttachM3U8Inline({
  id,
  onDone,
  autoFromClipboard = false,
  autoAttachIfValid = true,
  requireStrictClipboard = true, // ⬅️ important: auto UNIQUEMENT si clipboard est déjà .m3u8 strict
}: {
  id: string;
  onDone: () => void;
  autoFromClipboard?: boolean;
  autoAttachIfValid?: boolean;
  requireStrictClipboard?: boolean;
}) {
  const [pending, start] = useTransition();
  const [val, setVal] = useState("");
  const router = useRouter();
  const mountedRef = useRef(false);

  async function doAttach(candidate: string) {
    const res = await fetch("/api/modules/live/attach", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, m3u8: candidate }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert("Erreur attach: " + (j?.error || res.status));
      return;
    }
    onDone();
    router.refresh();
  }

  async function run() {
    const candidate = normalizeCandidate(val);
    if (!candidate) {
      alert("Je ne trouve pas de .m3u8 valable dans ce que tu as collé.");
      return;
    }
    await doAttach(candidate);
  }

  async function pasteFromClipboard() {
    try {
      const raw = await navigator.clipboard.readText();
      const fixed = normalizeCandidate(raw) || raw;
      setVal(fixed);

      if (!autoAttachIfValid) return;

      // Auto UNIQUEMENT si le clipboard BRUT est déjà un .m3u8 strict
      if (requireStrictClipboard && !isStrictM3u8(raw)) return;

      const cand = normalizeCandidate(raw); // on part du RAW, pas d'une réparation “trop” permissive
      if (isStrictM3u8(cand)) {
        start(() => doAttach(cand!));
      }
    } catch {
      /* ignore */
    }
  }

  // Ouverture modale → on tente la lecture clipboard (auto uniquement si strict)
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    if (autoFromClipboard) pasteFromClipboard();
  }, [autoFromClipboard]);

  // ❌ plus d’auto-attach “sur changement d’input” pour éviter les faux positifs

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

/* ============== VerifyButton ============== */

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

  // ton snippet/Bookmarklet si besoin
  const QUALITY_AUTOPROBE_SNIPPET = useMemo(() => {
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
        setOpen(true); // la modale s'ouvre ; l'attach auto ne se fait que si clipboard est .m3u8 strict
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
              {/* Auto: lit le presse-papiers à l’ouverture, mais ATTACHE auto UNIQUEMENT si clipboard est .m3u8 strict */}
              <AttachM3U8Inline
                id={id}
                onDone={() => {
                  setOpen(false);
                  router.refresh();
                }}
                autoFromClipboard
                autoAttachIfValid
                requireStrictClipboard
              />
            </div>

            <p className="text-xs text-gray-500">
              (L’accès au presse-papiers automatique nécessite souvent une
              action utilisateur et un contexte HTTPS. Si ça ne marche pas,
              clique “Coller”.)
            </p>
          </div>
        </div>
      )}
    </>
  );
}
