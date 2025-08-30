"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/libs/supabase/server";
import crypto from "node:crypto";

/** En-têtes "browser-like" pour réduire les faux BLOCKED */
const COMMON_HEADERS: Record<string, string> = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "accept-language": "fr-FR,fr;q=0.9,en;q=0.8",
  "cache-control": "no-cache",
  pragma: "no-cache",
};

const M3U8_ACCEPT =
  "application/vnd.apple.mpegurl,application/x-mpegURL;q=0.9,*/*;q=0.8";

/** GET page HTML avec headers communs */
async function fetchHtml(url: string, referer?: string) {
  return fetch(url, {
    method: "GET",
    headers: {
      ...COMMON_HEADERS,
      ...(referer ? { referer } : {}),
    },
    redirect: "follow",
    cache: "no-store",
  });
}

/** GET m3u8 pour vérifier s'il est atteignable */
async function fetchM3u8(url: string, referer?: string) {
  return fetch(url, {
    method: "GET",
    headers: {
      ...COMMON_HEADERS,
      accept: M3U8_ACCEPT,
      ...(referer ? { referer } : {}),
    },
    redirect: "follow",
    cache: "no-store",
  });
}

/** Extraction naïve des .m3u8 depuis le HTML */
function extractM3U8FromHtml(html: string): string | null {
  const regexes = [
    /https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/gi, // lien absolu
    /src=["']([^"']+\.m3u8[^"']*)["']/gi, // attribut src="...m3u8"
    // patterns courants JS : hls.loadSource("..."), file:"...m3u8", src:"...m3u8"
    /(?:loadSource\(|file\s*:\s*|source\s*:\s*|src\s*:\s*)["']([^"']+\.m3u8[^"']*)["']/gi,
  ];
  for (const re of regexes) {
    const match = re.exec(html);
    if (match) return (match[1] || match[0]).trim();
  }
  return null;
}

/** Ajout d'un lien */
export async function addLink(formData: FormData) {
  const url = String(formData.get("url") || "").trim();
  const title = String(formData.get("title") || "").trim() || null;
  if (!url) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const probe_token = crypto.randomBytes(16).toString("hex");

  await supabase.from("live_links").insert({
    user_id: user.id,
    url,
    title,
    status: "unknown",
    probe_token,
  });

  revalidatePath("/m/live");
}

/** Suppression d'un lien */
export async function deleteLink(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("live_links")
    .delete()
    .eq("user_id", user.id)
    .eq("id", id);

  revalidatePath("/m/live");
}

/** Vérification d'un lien : met à jour status + last_m3u8 */
export async function checkLink(formData: FormData) {
  const id = String(formData.get("id") || "");
  const url = String(formData.get("url") || "");
  if (!id || !url) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  let status: "online" | "offline" | "blocked" | "error" = "error";
  let last_m3u8: string | null = null;
  let notes = "";

  const COMMON_HEADERS = {
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": "fr-FR,fr;q=0.9,en;q=0.8",
    "cache-control": "no-cache",
    pragma: "no-cache",
    referer: url, // 👈 important pour certains serveurs
  } as const;

  const M3U8_ACCEPT =
    "application/vnd.apple.mpegurl,application/x-mpegURL;q=0.9,*/*;q=0.8";

  const fetchHtml = (u: string) =>
    fetch(u, {
      method: "GET",
      headers: COMMON_HEADERS,
      redirect: "follow",
      cache: "no-store",
    });

  const fetchM3u8 = (u: string) =>
    fetch(u, {
      method: "GET",
      headers: { ...COMMON_HEADERS, accept: M3U8_ACCEPT },
      redirect: "follow",
      cache: "no-store",
    });

  const extractM3U8FromHtml = (html: string): string | null => {
    const regexes = [
      /https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/gi,
      /src=["']([^"']+\.m3u8[^"']*)["']/gi,
      /(?:loadSource\(|file\s*:\s*|source\s*:\s*|src\s*:\s*)["']([^"']+\.m3u8[^"']*)["']/gi,
    ];
    for (const re of regexes) {
      const m = re.exec(html);
      if (m) return (m[1] || m[0]).trim();
    }
    return null;
  };

  try {
    if (/\.m3u8(\?|$)/i.test(url)) {
      const mr = await fetchM3u8(url);
      notes = `m3u8 HEAD/GET → ${mr.status} ${
        mr.headers.get("content-type") || ""
      }`;
      if (
        mr.status === 200 &&
        (mr.headers.get("content-type") || "").includes("mpegurl")
      ) {
        status = "online";
        last_m3u8 = url;
      } else if ([403, 429, 503].includes(mr.status)) {
        status = "blocked";
      } else {
        status = "offline";
      }
    } else {
      const res = await fetchHtml(url);
      notes = `HTML → ${res.status}`;
      if ([403, 429, 503].includes(res.status)) {
        status = "blocked";
      } else if (res.ok) {
        const html = await res.text();
        let candidate = extractM3U8FromHtml(html);

        // normaliser les URL relatives
        if (candidate) {
          try {
            if (candidate.startsWith("//")) {
              candidate = (new URL(url).protocol || "https:") + candidate;
            } else if (candidate.startsWith("/")) {
              const u = new URL(url);
              candidate = `${u.origin}${candidate}`;
            }
          } catch {}
        }

        if (candidate) {
          const mr = await fetchM3u8(candidate);
          notes += ` | m3u8 → ${mr.status} ${
            mr.headers.get("content-type") || ""
          }`;
          if (
            mr.ok &&
            (mr.headers.get("content-type") || "").includes("mpegurl")
          ) {
            status = "online";
            last_m3u8 = candidate;
          } else {
            status = [403, 429, 503].includes(mr.status)
              ? "blocked"
              : "offline";
          }
        } else {
          status = "offline";
          notes += " | aucun .m3u8 trouvé dans le HTML";
        }
      } else {
        status = "error";
      }
    }
  } catch (e: any) {
    status = "error";
    notes = `exception: ${String(e?.message || e)}`;
  }

  await supabase
    .from("live_links")
    .update({
      status,
      last_checked_at: new Date().toISOString(),
      last_m3u8,
      notes, // 👈 on loggue ce qu’on a vu
    })
    .eq("user_id", user.id)
    .eq("id", id);

  revalidatePath("/m/live");
}
