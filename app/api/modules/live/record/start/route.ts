import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST() {
  const supa = createRouteHandlerClient({ cookies });
  const { data: links, error } = await supa
    .from("live_links")
    .select("id,last_m3u8,user_id,status")
    .eq("status", "online");

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const jobs = [];
  for (const l of links || []) {
    if (l.last_m3u8 && /\.m3u8(\?|#|$)/i.test(l.last_m3u8)) {
      const { data: job } = await supa
        .from("live_recordings")
        .insert({
          link_id: l.id,
          user_id: l.user_id ?? null,
          m3u8: l.last_m3u8,
          status: "queued",
          auto: false,
          max_seconds: 3600,
        })
        .select("*")
        .single();
      if (job) jobs.push(job);
    }
  }
  return NextResponse.json({ jobs });
}
