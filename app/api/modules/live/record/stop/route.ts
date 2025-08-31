import { NextResponse } from "next/server";
import { createClient } from "@/libs/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // Body JSON (optionnel) + query compat
  let job_id: string | null = null;
  let hintedLinkId: string | null = null;

  try {
    const body = await req.json().catch(() => ({} as any));
    if (body && typeof body.job_id === "string") job_id = body.job_id;
    if (body && typeof body.linkId === "string") hintedLinkId = body.linkId;
  } catch {}
  const { searchParams } = new URL(req.url);
  const linkIdFromQuery = searchParams.get("linkId");
  const linkId = hintedLinkId || linkIdFromQuery || null;

  // 1) Si job_id fourni → on va directement chercher ce job
  if (job_id) {
    const { data: job, error: jobErr } = await supabase
      .from("live_recordings")
      .select("id,user_id,status")
      .eq("id", job_id)
      .maybeSingle();

    if (jobErr || !job || job.user_id !== user.id) {
      return NextResponse.json({ error: "job_not_found" }, { status: 404 });
    }
    if (!["queued", "recording"].includes(job.status || "")) {
      return NextResponse.json(
        { error: "job_not_recording_or_queued" },
        { status: 409 }
      );
    }

    const { data: upd, error: updErr } = await supabase
      .from("live_recordings")
      .update({ status: "stopping", stopped_by_user: true })
      .eq("id", job.id)
      .eq("user_id", user.id)
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

  // 2) Sinon, si linkId fourni (compat avec ton ancienne UI) → on prend le plus récent job de ce lien
  if (linkId) {
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
      return NextResponse.json(
        { error: "no_active_recording_for_link" },
        { status: 404 }
      );
    }

    const { data: upd, error: updErr } = await supabase
      .from("live_recordings")
      .update({ status: "stopping", stopped_by_user: true })
      .eq("id", rec.id)
      .eq("user_id", user.id)
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

  // 3) Sinon, sans param → on prend le dernier job de l’utilisateur (tous liens confondus)
  const { data: latest, error: latestErr } = await supabase
    .from("live_recordings")
    .select("id,status")
    .eq("user_id", user.id)
    .in("status", ["queued", "recording"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestErr || !latest) {
    return NextResponse.json({ error: "no_active_recording" }, { status: 404 });
  }

  const { data: upd, error: updErr } = await supabase
    .from("live_recordings")
    .update({ status: "stopping", stopped_by_user: true })
    .eq("id", latest.id)
    .eq("user_id", user.id)
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
