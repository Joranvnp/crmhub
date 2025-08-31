import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: Request) {
  const supa = createRouteHandlerClient({ cookies });
  const body = await req.json().catch(() => ({}));
  const { id, m3u8, maxSeconds } = body || {};
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  // Récupère le lien
  const { data: link, error: e1 } = await supa
    .from("live_links")
    .select("id,last_m3u8,user_id")
    .eq("id", id)
    .single();
  if (e1 || !link)
    return NextResponse.json({ error: "link not found" }, { status: 404 });

  const src = m3u8 || link.last_m3u8;
  if (!src || !/\.m3u8(\?|#|$)/i.test(src)) {
    return NextResponse.json({ error: "no m3u8 to record" }, { status: 400 });
  }

  const { data: job, error: e2 } = await supa
    .from("live_recordings")
    .insert({
      link_id: link.id,
      user_id: link.user_id ?? null,
      m3u8: src,
      status: "queued",
      auto: false,
      max_seconds: maxSeconds ?? 3600, // défaut 60 min
    })
    .select("*")
    .single();

  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
  return NextResponse.json({ job });
}
