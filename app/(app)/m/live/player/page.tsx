"use client";

import { JSX, useEffect, useMemo, useRef, useState } from "react";
import Hls from "hls.js";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function detectProvider(src: string) {
  const u = src.toLowerCase();
  if (
    u.includes("youtube.com") ||
    u.includes("youtu.be") ||
    u.includes("googlevideo.com")
  )
    return "youtube";
  if (u.includes("twitch.tv") || u.includes("ttvnw.net")) return "twitch";
  if (u.includes("vimeo.com") || u.includes("vimeocdn.com")) return "vimeo";
  if (u.endsWith(".m3u8") || u.includes(".m3u8?")) return "hls";
  return "unknown";
}

function extractYouTubeId(src: string): string | null {
  try {
    // cas m3u8 googlevideo: on a souvent "id/VIDEOID.something"
    const idMatch = src.match(/\/id\/([a-zA-Z0-9_-]{6,})/);
    if (idMatch) return idMatch[1].split(".")[0];

    const u = new URL(src);
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.split("/")[1] || null;
    }
    if (u.searchParams.get("v")) return u.searchParams.get("v");
    // fallback: rien trouvé
    return null;
  } catch {
    return null;
  }
}

function extractTwitchChannel(src: string): string | null {
  try {
    // si c'est un lien page twitch.tv/<channel>
    const u = new URL(src);
    if (u.hostname.includes("twitch.tv")) {
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts[0] && !["videos", "directory"].includes(parts[0]))
        return parts[0];
    }
    return null;
  } catch {
    return null;
  }
}

export default function LivePlayerPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const params = useSearchParams();
  const src = params.get("src") || "";
  const linkId = params.get("linkId") || ""; // 👈 AJOUT: on lit linkId si présent
  const provider = useMemo(() => detectProvider(src), [src]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (provider !== "hls") return;
    const video = videoRef.current;
    if (!video || !src) return;

    setErrorMsg(null);

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        // ↓ Réglages anti-stall
        lowLatencyMode: false, // laisse en "false" si flux non LL-HLS
        capLevelToPlayerSize: true, // évite de prendre trop gros
        startLevel: -1, // laisse ABR auto
        backBufferLength: 30,
        maxBufferLength: 15, // buffer "target" plus court
        maxMaxBufferLength: 60,
        maxBufferHole: 0.5,
        liveSyncDuration: 3,
        liveMaxLatencyDuration: 10,
        nudgeOffset: 0.1,
        nudgeMaxRetry: 5,
        // ABR un peu prudente
        abrEwmaDefaultEstimate: 3000000, // 3 Mbps par défaut
        abrBandWidthFactor: 0.8,
        abrBandWidthUpFactor: 0.7,
      });

      hls.on(Hls.Events.ERROR, (_e, data) => {
        // Log utile en dev
        console.debug("[HLS][ERROR]", data);

        // Non fatal : gérer buffer stall doucement
        if (!data.fatal) {
          const d = (data as any).details || data.details;
          if (
            d === "bufferStalledError" ||
            d === Hls.ErrorDetails?.BUFFER_STALLED_ERROR
          ) {
            // petit coup de pouce au currentTime
            try {
              if (video.readyState > 0) {
                const t = video.currentTime;
                video.currentTime = Math.max(0, t - 0.001);
              }
            } catch {}
          }
          return;
        }

        // Fatal : stratégie de recovery
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            hls.startLoad(); // relance le chargement
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            hls.recoverMediaError();
            break;
          default:
            hls.destroy();
            setErrorMsg("Erreur HLS fatale.");
            break;
        }
      });

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        // démarrage lecture si possible
        video.play().catch(() => {});
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, d) => {
        // si besoin, tu peux logger le niveau courant
        // console.debug('[HLS] level ->', d.level);
      });

      hls.loadSource(src);
      hls.attachMedia(video);

      return () => hls.destroy();
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari natif
      video.src = src;
    } else {
      setErrorMsg("HLS non supporté par le navigateur.");
    }
  }, [src, provider]);

  // Rendus selon provider
  let content: JSX.Element;
  if (!src) {
    content = (
      <div className="text-gray-600">
        Aucun <code>src</code> fourni.
      </div>
    );
  } else if (provider === "youtube") {
    const vid = extractYouTubeId(src);
    content = vid ? (
      <div className="aspect-video w-full">
        <iframe
          className="w-full h-full rounded"
          src={`https://www.youtube.com/embed/${vid}?autoplay=1&rel=0`}
          title="YouTube Live"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      </div>
    ) : (
      <div className="text-red-600">
        Impossible d’identifier l’ID YouTube. Fournis un lien vidéo/ID valide.
      </div>
    );
  } else if (provider === "twitch") {
    const chan = extractTwitchChannel(src);
    content = chan ? (
      <div className="aspect-video w-full">
        {/* Remplace parent=localhost par le domaine lors du déploiement */}
        <iframe
          className="w-full h-full rounded"
          src={`https://player.twitch.tv/?channel=${chan}&parent=localhost&autoplay=true`}
          title="Twitch Live"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      </div>
    ) : (
      <div className="text-red-600">
        Impossible d’identifier la chaîne Twitch.
      </div>
    );
  } else if (provider === "vimeo") {
    // Ici, on attend un lien page vimeo. Pour live pro, l'embed officiel est recommandé.
    content = (
      <div className="text-gray-700">
        Source Vimeo détectée. Utilise l’URL d’embed officiel (ou un ID) pour un
        rendu fiable.
      </div>
    );
  } else if (provider === "hls") {
    content = (
      <>
        {errorMsg && (
          <div className="p-3 mb-3 rounded bg-yellow-50 text-yellow-900 border border-yellow-200">
            {errorMsg}
          </div>
        )}
        <video
          ref={videoRef}
          controls
          autoPlay
          playsInline
          className="w-full rounded bg-black"
        />
      </>
    );
  } else {
    content = (
      <div className="text-gray-700">
        Provider inconnu. Si c’est un `.m3u8`, assure-toi que la source autorise
        la lecture cross-origin (CORS).
      </div>
    );
  }

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Live Player</h1>
        <Link href="/m/live" className="underline">
          ← Retour
        </Link>
      </div>
      {content}
      <div className="text-xs text-gray-500 break-all">
        Source: <code>{src}</code>
      </div>

      {/* === AJOUT: barre d’actions universelle (avec ou sans linkId) === */}
      <PlayerActionsUniversal m3u8={src} linkId={linkId || null} />

      {provider === "hls" && (
        <div className="text-sm text-gray-600">
          Astuce: pour tes propres flux (S3/CloudFront), ouvre le CORS sur le
          bucket/distribution.
          <br />
          YouTube/Twitch/Vimeo → utilise les lecteurs officiels.
        </div>
      )}
    </main>
  );
}

/* ===== AJOUTS INLINE (helpers + UI) ===== */

function fmtBytes(x?: number | null) {
  if (!x || x <= 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let n = x,
    i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(1)} ${units[i]}`;
}

function PlayerActionsUniversal({
  m3u8,
  linkId,
}: {
  m3u8: string;
  linkId: string | null;
}) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);

  async function startFromM3u8() {
    if (!m3u8 || !/\.m3u8(\?|#|$)/i.test(m3u8)) {
      alert("Le player n’a pas une URL .m3u8 valide.");
      return;
    }
    setStarting(true);
    try {
      const r = await fetch("/api/modules/live/record/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          m3u8,
          linkId: linkId || null,
          maxSeconds: 3600,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(
          `Erreur start (${r.status}): ${j?.error || j?._raw || "unknown"}`
        );
        return;
      }
      alert("Job d’enregistrement créé ✅");
      if (linkId) await load(); // rafraîchir la liste seulement si on a un lien
    } finally {
      setStarting(false);
    }
  }

  async function getSigned(path: string) {
    const r = await fetch(
      `/api/modules/live/record/signed?path=${encodeURIComponent(path)}`
    );
    const j = await r.json().catch(() => ({}));
    if (j?.url) window.open(j.url, "_blank");
    else alert("Impossible de générer le lien signé");
  }

  async function load() {
    if (!linkId) return;
    setLoading(true);
    try {
      const r = await fetch(
        `/api/modules/live/record/list?linkId=${encodeURIComponent(linkId)}`,
        { cache: "no-store" }
      );
      const j = await r.json();
      setItems(Array.isArray(j?.items) ? j.items : []);
    } catch (e: any) {
      alert("Erreur chargement enregistrements: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function downloadLast() {
    if (!linkId) return;
    if (!items.length) await load();
    const done = (items.length ? items : []).filter(
      (x: any) => x.status === "completed" && x.file_path
    );
    if (!done.length) return alert("Aucun enregistrement terminé trouvé.");
    await getSigned(done[0].file_path);
  }

  useEffect(() => {
    if (linkId) load();
  }, [linkId]);

  return (
    <div className="mt-4 border-t pt-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          className="px-3 py-1 rounded bg-black text-white text-sm"
          onClick={startFromM3u8}
          disabled={starting}
        >
          ⏺️ Enregistrer ce flux (.m3u8)
        </button>

        {linkId ? (
          <>
            <button
              className="px-3 py-1 rounded border text-sm"
              onClick={downloadLast}
            >
              Télécharger le dernier
            </button>
            <button
              className="px-3 py-1 rounded border text-sm"
              onClick={load}
              disabled={loading}
            >
              Rafraîchir la liste
            </button>
          </>
        ) : (
          <span className="text-xs text-gray-500">
            (Ouvrez le player depuis un live pour voir la liste des
            enregistrements)
          </span>
        )}
      </div>

      {linkId && (
        <div className="w-full overflow-x-auto">
          {loading ? (
            <div className="text-sm text-gray-600">Chargement…</div>
          ) : !items.length ? (
            <div className="text-sm text-gray-600">
              Aucun enregistrement pour l’instant.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-2 pr-4">Statut</th>
                  <th className="py-2 pr-4">Créé</th>
                  <th className="py-2 pr-4">Terminé</th>
                  <th className="py-2 pr-4">Taille</th>
                  <th className="py-2 pr-4">Télécharger</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-t">
                    <td className="py-2 pr-4">
                      {it.status === "completed"
                        ? "✅"
                        : it.status === "recording"
                        ? "⏺️"
                        : it.status === "queued"
                        ? "⏳"
                        : it.status === "error"
                        ? "❌"
                        : "–"}{" "}
                      <span className="uppercase">{it.status}</span>
                    </td>
                    <td className="py-2 pr-4">
                      {new Date(it.created_at).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4">
                      {it.ended_at
                        ? new Date(it.ended_at).toLocaleString()
                        : "-"}
                    </td>
                    <td className="py-2 pr-4">{fmtBytes(it.bytes)}</td>
                    <td className="py-2 pr-4">
                      {it.file_path ? (
                        <button
                          onClick={() => getSigned(it.file_path!)}
                          className="px-2 py-1 rounded border"
                          title={it.file_path || ""}
                        >
                          Télécharger (signé)
                        </button>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
