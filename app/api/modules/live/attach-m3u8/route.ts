import { NextResponse } from "next/server";
import { createClient } from "@/libs/supabase/server";

export const dynamic = "force-dynamic";

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
  const supabase = createClient();
  const {
    data: { user },
  } = await (await supabase).auth.getUser();
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
  if (!id || !raw)
    return NextResponse.json(
      { error: "id and m3u8 required" },
      { status: 400 }
    );

  let m3u8: string;
  try {
    m3u8 = normalize(raw);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "invalid_url" },
      { status: 400 }
    );
  }

  const { data: link } = await (await supabase)
    .from("live_links")
    .select("id,user_id,provider")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (!link) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const patch = {
    last_m3u8: m3u8,
    provider: link.provider || "raw_hls",
    status: "online" as const,
    last_probe_at: new Date().toISOString(),
    last_checked_at: new Date().toISOString(),
    last_error_code: null as string | null,
  };

  const { data: updated, error: upErr } = await (await supabase)
    .from("live_links")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();
  if (upErr)
    return NextResponse.json(
      { error: "db_update_failed", detail: upErr.message },
      { status: 500 }
    );

  return NextResponse.json({ data: updated }, { status: 200 });
}
