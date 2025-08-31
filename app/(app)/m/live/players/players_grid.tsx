// app/(app)/m/live/players/players_grid.tsx
"use client";

import { useEffect, useRef } from "react";

type Item = {
  id: string; // linkId (depuis live_links)
  title: string;
  pageUrl: string;
  m3u8: string;
  status: string;
  // 👇 pour éviter une erreur TS avec players/page.tsx qui passe 'auto'
  auto?: boolean | null;
};

/* === Helpers téléchargement signé === */
async function getSigned(path: string) {
  try {
    const r = await fetch(
      `/api/modules/live/record/signed?path=${encodeURIComponent(path)}`
    );
    const j = await r.json().catch(() => ({}));
    if (j?.url) window.open(j.url, "_blank");
    else alert("Impossible de générer le lien signé");
  } catch (e: any) {
    alert("Erreur lien signé: " + (e?.message || e));
  }
}

async function downloadLast(linkId: string) {
  try {
    const r = await fetch(
      `/api/modules/live/record/list?linkId=${encodeURIComponent(linkId)}`,
      { cache: "no-store" }
    );
    const j = await r.json().catch(() => ({}));
    const items = Array.isArray(j?.items) ? j.items : [];
    const done = items.filter(
      (x: any) => x.status === "completed" && x.file_path
    );
    if (!done.length) {
      alert("Aucun enregistrement terminé trouvé.");
      return;
    }
    await getSigned(done[0].file_path);
  } catch (e: any) {
    alert("Erreur téléchargement: " + (e?.message || e));
  }
}

export default function PlayersGrid({ items }: { items: Item[] }) {
  function openAll() {
    // Ouvre chaque flux dans ton player interne (on passe aussi linkId)
    items.forEach((it) => {
      const url = `/m/live/player?src=${encodeURIComponent(
        it.m3u8
      )}&linkId=${encodeURIComponent(it.id)}`;
      window.open(url, "_blank", "noopener");
    });
  }

  return (
    <>
      <div className="flex items-center justify-end pb-2">
        <button
          onClick={openAll}
          className="px-3 py-1 text-sm rounded bg-black text-white"
          title="Peut être limité par le bloqueur de pop-up du navigateur"
        >
          Tout ouvrir (onglets)
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <PlayerCard key={it.id} item={it} />
        ))}
      </div>
    </>
  );
}

function PlayerCard({ item }: { item: Item }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    let hls: any = null;
    let destroyed = false;

    (async () => {
      // Si Safari/iOS sait lire HLS nativement
      const canNative =
        v.canPlayType("application/vnd.apple.mpegurl") === "probably" ||
        v.canPlayType("application/x-mpegURL") === "probably";

      if (canNative) {
        v.src = item.m3u8;
        try {
          await v.play();
        } catch {
          /* ignore */
        }
        return;
      }

      // Import Hls.js dynamiquement (et de façon tolérante aux types)
      let Hls: any = null;
      try {
        const mod: any = await import("hls.js"); // si pas installé: on catch
        Hls = mod?.default ?? mod;
      } catch {
        Hls = null;
      }
      if (destroyed) return;

      if (Hls && typeof Hls.isSupported === "function" && Hls.isSupported()) {
        try {
          hls = new Hls();
          hls.loadSource(item.m3u8);
          hls.attachMedia(v);
          hls.on(Hls.Events.ERROR, (_evt: any, data: any) => {
            if (data?.fatal) {
              try {
                hls?.destroy?.();
              } catch {}
              hls = null;
              // Fallback source directe
              v.src = item.m3u8;
            }
          });
          try {
            await v.play();
          } catch {
            /* ignore */
          }
        } catch {
          // Fallback
          v.src = item.m3u8;
          try {
            await v.play();
          } catch {
            /* ignore */
          }
        }
      } else {
        // Fallback si Hls.js non dispo
        v.src = item.m3u8;
        try {
          await v.play();
        } catch {
          /* ignore */
        }
      }
    })();

    return () => {
      destroyed = true;
      try {
        hls?.destroy?.();
      } catch {}
    };
  }, [item.m3u8]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(item.m3u8);
      alert("Lien copié ✅");
    } catch {
      alert("Impossible de copier (permissions)");
    }
  }

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <div className="aspect-video bg-black">
        <video
          ref={videoRef}
          controls
          playsInline
          preload="metadata"
          className="w-full h-full"
        />
      </div>

      <div className="p-3 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="font-medium text-sm truncate">{item.title}</div>
          <span
            className={`text-[11px] px-2 py-0.5 rounded-full ${
              item.status === "online"
                ? "bg-green-100 text-green-700"
                : item.status === "blocked"
                ? "bg-yellow-100 text-yellow-700"
                : item.status === "offline"
                ? "bg-red-100 text-red-700"
                : "bg-gray-100 text-gray-700"
            }`}
          >
            {item.status}
          </span>
        </div>

        <div className="text-xs text-gray-500 break-all">{item.m3u8}</div>

        <div className="flex items-center gap-2 pt-2 flex-wrap">
          <a
            href={`/m/live/player?src=${encodeURIComponent(
              item.m3u8
            )}&linkId=${encodeURIComponent(item.id)}`}
            target="_blank"
            className="px-2 py-1 text-xs rounded border"
          >
            Ouvrir dans le player
          </a>

          <a
            href={item.pageUrl}
            target="_blank"
            className="px-2 py-1 text-xs rounded border"
          >
            Page d’origine
          </a>

          <button
            onClick={copy}
            className="px-2 py-1 text-xs rounded bg-black text-white"
          >
            Copier
          </button>

          {/* 👇 NOUVEAU : Télécharger le dernier enregistrement */}
          <button
            onClick={() => downloadLast(item.id)}
            className="px-2 py-1 text-xs rounded border"
            title="Télécharge le dernier enregistrement terminé"
          >
            Télécharger le dernier
          </button>
        </div>
      </div>
    </div>
  );
}
