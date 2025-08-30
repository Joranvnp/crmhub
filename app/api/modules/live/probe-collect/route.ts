import { NextResponse, NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};
export const dynamic = "force-dynamic";
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

// --- mêmes helpers que ci-dessus ---
function isM3U8(u: string) {
  return /\.m3u8(\?|#|$)/i.test(u);
}
async function fetchText(url: string, ms = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, {
      headers: { accept: "application/vnd.apple.mpegurl,*/*;q=0.8" },
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
function isMasterPlaylist(txt: string) {
  return /#EXT-X-STREAM-INF/i.test(txt);
}
function deriveMasterCandidates(u: string) {
  const c = new Set<string>([
    u,
    u.replace(/chunklist[^/]*\.m3u8/i, "playlist.m3u8"),
    u.replace(/chunklist[^/]*\.m3u8/i, "master.m3u8"),
    u.replace(/index[^/]*\.m3u8/i, "playlist.m3u8"),
    u.replace(/index[^/]*\.m3u8/i, "master.m3u8"),
  ]);
  return [...c].filter(isM3U8);
}
async function upgradeToMasterIfPossible(u: string) {
  for (const cand of deriveMasterCandidates(u)) {
    const txt = await fetchText(cand);
    if (txt && isMasterPlaylist(txt)) return cand;
  }
  return u;
}

export async function POST(req: NextRequest) {
  try {
    const ct = req.headers.get("content-type") || "";
    let body: any;
    if (ct.includes("application/json")) body = await req.json();
    else {
      const txt = await req.text();
      try {
        body = JSON.parse(txt);
      } catch {
        return new NextResponse(JSON.stringify({ error: "invalid_body" }), {
          status: 400,
          headers: { ...CORS, "content-type": "application/json" },
        });
      }
    }

    const id = String(body.id || body.link_id || "").trim();
    const probe_token = String(body.probe_token || "").trim();
    const m3u8Raw = typeof body.m3u8 === "string" ? body.m3u8.trim() : "";
    const page_url =
      typeof body.page_url === "string" ? body.page_url : body.page || "";

    if (!id || !probe_token) {
      return new NextResponse(JSON.stringify({ error: "missing_params" }), {
        status: 400,
        headers: { ...CORS, "content-type": "application/json" },
      });
    }

    const { data: link } = await supabase
      .from("live_links")
      .select("id, probe_token, provider")
      .eq("id", id)
      .single();
    if (!link)
      return new NextResponse(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: { ...CORS, "content-type": "application/json" },
      });
    if (link.probe_token !== probe_token) {
      return new NextResponse(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...CORS, "content-type": "application/json" },
      });
    }

    const upd: Record<string, any> = {
      last_probe_at: new Date().toISOString(),
    };

    if (m3u8Raw && isM3U8(m3u8Raw)) {
      const best = await upgradeToMasterIfPossible(m3u8Raw); // ⬅️ upgrade ici
      upd.status = "online";
      upd.last_m3u8 = best;
      upd.provider = link.provider || "raw_hls";
      upd.last_error_code = null;
      if (page_url) upd.notes = `probe from: ${page_url}`;
    } else {
      upd.status = "unknown";
    }

    await supabase.from("live_links").update(upd).eq("id", id);

    return new NextResponse(null, { status: 204, headers: CORS });
  } catch (e: any) {
    return new NextResponse(
      JSON.stringify({ error: "server_error", detail: e?.message }),
      {
        status: 500,
        headers: { ...CORS, "content-type": "application/json" },
      }
    );
  }
}
