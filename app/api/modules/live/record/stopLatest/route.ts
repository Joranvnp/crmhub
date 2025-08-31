import { NextResponse } from "next/server";
import { createClient } from "@/libs/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const linkId = new URL(req.url).searchParams.get("linkId");
  if (!linkId)
    return NextResponse.json({ error: "missing linkId" }, { status: 400 });

  // on cible le dernier recording actif (queued/recording)
  const { data: rec, error } = await supabase
    .from("live_recordings")
    .select("id,status")
    .eq("user_id", user.id)
    .eq("link_id", linkId)
    .in("status", ["queued", "recording"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !rec) {
    return NextResponse.json({ error: "no_active_recording" }, { status: 404 });
  }

  const { data: upd, error: updErr } = await supabase
    .from("live_recordings")
    .update({ status: "stopping", stopped_by_user: true })
    .eq("id", rec.id)
    .select()
    .maybeSingle();

  if (updErr) {
    return NextResponse.json(
      { error: "db_update_failed", detail: updErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, data: upd }, { status: 200 });
}
