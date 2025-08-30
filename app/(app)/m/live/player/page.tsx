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
  const provider = useMemo(() => detectProvider(src), [src]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (provider !== "hls") return;
    const video = videoRef.current;
    if (!video || !src) return;

    setErrorMsg(null);

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data?.details === "manifestLoadError") {
          setErrorMsg(
            "Impossible de charger le manifeste HLS (CORS/anti-bot ?). " +
              "Si la source est YouTube/Twitch/Vimeo, utilise l'embed officiel."
          );
        } else {
          setErrorMsg("Erreur HLS : " + (data?.details || "inconnue"));
        }
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
