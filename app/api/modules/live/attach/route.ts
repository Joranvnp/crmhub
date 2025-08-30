import { NextResponse } from "next/server";
import { createClient } from "@/libs/supabase/server";

export const dynamic = "force-dynamic";

// GET pour tester rapidement que la route est bien joignable
export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/modules/live/attach" });
}

function isM3U8(u: string) {
  return /\.m3u8(\?|#|$)/i.test(u);
}
function normalize(raw: string) {
  const s = (raw || "").trim();
  const u = new URL(s);
  if (!/^https?:$/.test(u.protocol)) throw new Error("invalid_protocol");
  if (!isM3U8(u.pathname + u.search + u.hash)) throw new Error("not_m3u8");
  if (u.toString().length > 2048) throw new Error("url_too_long");
  return u.toString();
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const id = String(body.id || "").trim();
    const raw = String(body.m3u8 || "").trim();
    if (!id || !raw) {
      return NextResponse.json(
        { error: "id and m3u8 required" },
        { status: 400 }
      );
    }

    let m3u8: string;
    try {
      m3u8 = normalize(raw);
    } catch (e: any) {
      return NextResponse.json(
        { error: e?.message || "invalid_url" },
        { status: 400 }
      );
    }

    // Vérifier ownership
    const { data: link, error: findErr } = await supabase
      .from("live_links")
      .select("id,user_id,last_m3u8,status") // minimal; ajoute 'provider' si tu as la colonne
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (findErr || !link) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // Patch minimal compatible avec ta CHECK(status)
    const patch: Record<string, any> = {
      last_m3u8: m3u8,
      status: "online", // autorisé par ta contrainte
    };
    // Si tu as ces colonnes, décommente :
    // patch.provider = "raw_hls";
    // patch.last_probe_at = new Date().toISOString();
    // patch.last_checked_at = new Date().toISOString();
    // patch.last_error_code = null;

    const { data: updated, error: upErr } = await supabase
      .from("live_links")
      .update(patch)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .maybeSingle();

    if (upErr || !updated) {
      return NextResponse.json(
        {
          error: "db_update_failed",
          detail: upErr?.message || "no_row_updated",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: updated }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: "server_error", detail: String(e?.message || e) },
      { status: 500 }
    );
  }
}
