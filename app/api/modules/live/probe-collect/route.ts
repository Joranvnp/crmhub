import { NextResponse, NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  try {
    const ct = req.headers.get("content-type") || "";
    let body: any;
    if (ct.includes("application/json")) {
      body = await req.json();
    } else {
      // Beacon peut envoyer text/plain
      const txt = await req.text();
      try {
        body = JSON.parse(txt);
      } catch {
        return new NextResponse(JSON.stringify({ error: "invalid_body" }), {
          status: 400,
          headers: { ...CORS_HEADERS, "content-type": "application/json" },
        });
      }
    }

    const id = String(body.id || body.link_id || "").trim();
    const probe_token = String(body.probe_token || "").trim();
    const m3u8 = typeof body.m3u8 === "string" ? body.m3u8.trim() : "";
    const page_url =
      typeof body.page_url === "string" ? body.page_url : body.page || "";

    if (!id || !probe_token) {
      return new NextResponse(JSON.stringify({ error: "missing_params" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "content-type": "application/json" },
      });
    }

    // Vérifier le token
    const { data: link, error: findErr } = await supabase
      .from("live_links")
      .select("id, probe_token, provider")
      .eq("id", id)
      .single();

    if (findErr || !link) {
      return new NextResponse(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: { ...CORS_HEADERS, "content-type": "application/json" },
      });
    }
    if (link.probe_token !== probe_token) {
      return new NextResponse(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "content-type": "application/json" },
      });
    }

    const upd: Record<string, any> = {
      last_probe_at: new Date().toISOString(),
    };

    if (m3u8 && /\.m3u8(\?|#|$)/i.test(m3u8)) {
      upd.status = "online";
      upd.last_m3u8 = m3u8;
      upd.last_error_code = null;
      upd.provider = link.provider || "raw_hls";
    } else {
      // pas trouvé: ne pas dégrader; on note qu'un probe a eu lieu
      upd.status = "unknown";
    }

    await supabase.from("live_links").update(upd).eq("id", id);

    // 204 pour Beacon; + CORS headers
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  } catch (e: any) {
    return new NextResponse(
      JSON.stringify({ error: "server_error", detail: e?.message }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "content-type": "application/json" },
      }
    );
  }
}
