// app/api/modules/live/record/start/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/libs/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Effet:
 *  - Sélectionne tous les live_links de l'utilisateur courant
 *    avec status = 'online' et last_m3u8 non nul
 *  - Crée un job "queued" (live_recordings) pour chacun (si pas déjà en cours)
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    // Récupère les liens online
    const { data: links, error } = await supabase
      .from("live_links")
      .select("id,last_m3u8,user_id,status")
      .eq("user_id", user.id)
      .eq("status", "online")
      .not("last_m3u8", "is", null);

    if (error) {
      return NextResponse.json(
        { error: "db_select_failed", detail: error.message },
        { status: 500 }
      );
    }

    const candidates = (links || []).filter((l) => !!l.last_m3u8?.trim());
    if (!candidates.length) {
      return NextResponse.json({ data: { created: 0 } }, { status: 200 });
    }

    // Option: éviter les doublons si un job recording/queued existe déjà pour le même link_id
    const linkIds = candidates.map((l) => l.id);
    const { data: existing } = await supabase
      .from("live_recordings")
      .select("id,link_id,status")
      .eq("user_id", user.id)
      .in("link_id", linkIds)
      .in("status", ["queued", "recording"]);

    const busy = new Set((existing || []).map((r) => r.link_id));
    const toCreate = candidates.filter((c) => !busy.has(c.id));

    if (!toCreate.length) {
      return NextResponse.json(
        { data: { created: 0, skipped: candidates.length } },
        { status: 200 }
      );
    }

    const rows = toCreate.map((c) => ({
      user_id: user.id,
      link_id: c.id,
      m3u8: c.last_m3u8!,
      status: "queued",
      max_seconds: 3600,
    }));

    const { error: insErr } = await supabase
      .from("live_recordings")
      .insert(rows);
    if (insErr) {
      return NextResponse.json(
        { error: "db_insert_failed", detail: insErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { data: { created: rows.length, totalOnline: candidates.length } },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: "server_error", detail: String(e?.message || e) },
      { status: 500 }
    );
  }
}
