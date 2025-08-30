import { NextResponse } from "next/server";
import { createClient } from "@/libs/supabase/server";

export const dynamic = "force-dynamic";

function isM3U8(u: string) {
  return /\.m3u8(\?|#|$)/i.test(u);
}
function normalize(raw: string) {
  const s = (raw || "").trim();
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    throw new Error("invalid_url");
  }
  if (!/^https?:$/.test(url.protocol)) throw new Error("invalid_protocol");
  if (!isM3U8(url.pathname + url.search + url.hash))
    throw new Error("not_m3u8");
  const str = url.toString();
  if (str.length > 2048) throw new Error("url_too_long");
  return str;
}

// GET pour vérifier que la route existe
export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/modules/live/attach" });
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

    // ⚠️ Ne sélectionner que les colonnes présentes dans ton schéma
    const { data: link, error: selErr } = await supabase
      .from("live_links")
      .select("id,user_id") // <= pas de provider ici
      .eq("id", id)
      .eq("user_id", user.id) // ownership
      .single();

    if (selErr || !link) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // ⚠️ Ne mettre à jour que ce qui existe
    const patch = {
      last_m3u8: m3u8,
      status: "online" as const,
      last_checked_at: new Date().toISOString(),
      // notes: "attach via UI", // (optionnel) cette colonne existe chez toi
    };

    const { data: updated, error: upErr } = await supabase
      .from("live_links")
      .update(patch)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (upErr) {
      return NextResponse.json(
        { error: "db_update_failed", detail: upErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: updated }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: "server_error", detail: e?.message || String(e) },
      { status: 500 }
    );
  }
}
