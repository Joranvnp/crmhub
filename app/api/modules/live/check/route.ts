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

    const { data: link, error: linkErr } = await supabase
      .from("live_links")
      .select("id,user_id,url,last_m3u8,status")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (linkErr || !link) {
      return NextResponse.json(
        { error: "not_found", detail: linkErr?.message },
        { status: 404 }
      );
    }

    const target = (link.last_m3u8 && link.last_m3u8.trim()) || link.url;

    let computed: string = "error";
    const res = await tryFetch(target, 6000);

    if ((res as any)._err) {
      const msg = String((res as any)._err).toLowerCase();
      // timeouts/aborts → on considère "blocked"
      computed =
        msg.includes("abort") || msg.includes("timed") ? "blocked" : "blocked";
    } else if (res.ok) {
      computed = "online";
    } else if ([401, 403, 429, 503].includes(Number(res.status))) {
      // avant on mettait "maybe_online" → désormais "blocked"
      computed = "blocked";
    } else if (res.status === 404) {
      computed = "offline";
    } else {
      computed = "error";
    }

    const status: AllowedStatus = clampStatus(computed);

    const { data: updData, error: updErr } = await supabase
      .from("live_links")
      .update({ status }) // 👈 pas d'autres colonnes "risquées"
      .eq("id", id)
      .eq("user_id", user.id)
      .select();

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

    const updated = Array.isArray(updData) ? updData[0] ?? null : updData;
    return NextResponse.json({ data: updated }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: "server_error", detail: String(e?.message || e) },
      { status: 500 }
    );
  }
}
