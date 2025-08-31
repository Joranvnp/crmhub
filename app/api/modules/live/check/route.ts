// app/api/modules/live/check/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/libs/supabase/server";

export const dynamic = "force-dynamic";

type AllowedStatus = "unknown" | "online" | "offline" | "blocked" | "error";

async function tryFetch(url: string, ms = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
    });
    return res;
  } catch (e: any) {
    return { ok: false, status: 0, _err: String(e?.message || e) } as any;
  } finally {
    clearTimeout(t);
  }
}

// Map tous les cas douteux -> un statut autorisé par ton CHECK constraint
function clampStatus(raw: string): AllowedStatus {
  switch (raw) {
    case "online":
      return "online";
    case "offline":
      return "offline";
    case "error":
      return "error";
    case "blocked":
    case "maybe_online": // 👈 on ne l’écrit plus : on rabat vers "blocked"
      return "blocked";
    default:
      return "unknown";
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

    // 🔎 on lit aussi auto_record + last_m3u8
    const { data: link, error: linkErr } = await supabase
      .from("live_links")
      .select("id,user_id,url,last_m3u8,status,auto_record")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (linkErr || !link) {
      return NextResponse.json(
        { error: "not_found", detail: linkErr?.message },
        { status: 404 }
      );
    }

    const prevStatus = (link.status as AllowedStatus) || "unknown";
    const target = (link.last_m3u8 && link.last_m3u8.trim()) || link.url;

    // —— check HTTP simple sur target (ton implémentation)
    let computed: string = "error";
    const res = await tryFetch(target, 6000);

    if ((res as any)._err) {
      const msg = String((res as any)._err).toLowerCase();
      computed =
        msg.includes("abort") || msg.includes("timed") ? "blocked" : "blocked";
    } else if (res.ok) {
      computed = "online";
    } else if ([401, 403, 429, 503].includes(Number(res.status))) {
      computed = "blocked";
    } else if (res.status === 404) {
      computed = "offline";
    } else {
      computed = "error";
    }

    const status: AllowedStatus = clampStatus(computed);

    // —— mise à jour du statut UNIQUEMENT (comme tu le voulais)
    const { data: updData, error: updErr } = await supabase
      .from("live_links")
      .update({ status }) // 👈 pas d'autres colonnes "risquées"
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id,status,last_m3u8,auto_record,user_id")
      .maybeSingle();

    if (updErr) {
      return NextResponse.json(
        {
          error: "db_update_failed",
          detail: updErr.message,
          code: (updErr as any).code,
        },
        { status: 500 }
      );
    }

    const updated = updData || null;

    // —— AUTO-RECORD : si on vient de passer ONLINE + auto_record + m3u8 strict
    let jobCreated: { id: string; status: string } | null = null;

    const becameOnline =
      prevStatus !== "online" && updated?.status === "online";

    const m3u8 = updated?.last_m3u8 || link.last_m3u8 || "";
    const hasValidM3u8 = !!m3u8 && /\.m3u8(\?|#|$)/i.test(m3u8);

    if (
      updated?.auto_record &&
      updated?.status === "online" &&
      hasValidM3u8 &&
      becameOnline
    ) {
      // anti-dup: pas de job queued/recording récent (<10min) pour ce lien
      const { data: recent } = await supabase
        .from("live_recordings")
        .select("id,status,created_at")
        .eq("link_id", updated.id)
        .in("status", ["queued", "recording"])
        .gte("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
        .limit(1);

      if (!recent || recent.length === 0) {
        const { data: job, error: insErr } = await supabase
          .from("live_recordings")
          .insert({
            link_id: updated.id,
            user_id: user.id, // ✅ RLS: insert-own
            m3u8,
            status: "queued",
            auto: true,
            max_seconds: 3600, // défaut 60 min
          })
          .select("id,status")
          .maybeSingle();

        if (!insErr && job) {
          jobCreated = { id: job.id as string, status: job.status as string };
        }
      }
    }

    return NextResponse.json(
      {
        data: {
          id: updated?.id,
          status: updated?.status,
          last_m3u8: updated?.last_m3u8 ?? link.last_m3u8 ?? null,
          auto_record: updated?.auto_record ?? link.auto_record ?? false,
          jobCreated,
        },
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: "server_error", detail: String(e?.message || e) },
      { status: 500 }
    );
  }
}
