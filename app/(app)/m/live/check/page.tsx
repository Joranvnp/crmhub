import { NextResponse } from "next/server";
import { createClient } from "@/libs/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await (await supabase).auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

    // Récupère le lien (RLS)
    const { data: link, error: linkErr } = await (await supabase)
      .from("live_links")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (linkErr || !link)
      return NextResponse.json({ error: "not_found" }, { status: 404 });

    const target = link.last_m3u8 || link.url;
    let status: string = "unknown";
    let last_error_code: string | null = null;

    try {
      const res = await fetch(target, { method: "GET", redirect: "follow" });
      if (res.ok) status = "online";
      else {
        status = ["401", "403", "429", "503"].includes(String(res.status))
          ? "maybe_online"
          : res.status === 404
          ? "invalid"
          : "error";
        last_error_code = String(res.status);
      }
    } catch (e: any) {
      const msg = String(e?.message || "").toLowerCase();
      status = msg.includes("cors") ? "maybe_online" : "blocked";
      last_error_code = msg.includes("cors") ? "cors" : "network";
    }

    const patch = {
      status,
      last_error_code,
      last_checked_at: new Date().toISOString(),
    };
    const { data: updated, error: upErr } = await (await supabase)
      .from("live_links")
      .update(patch)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (upErr)
      return NextResponse.json({ error: "db_update_failed" }, { status: 500 });

    return NextResponse.json({ data: updated }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: "server_error", detail: String(e?.message || e) },
      { status: 500 }
    );
  }
}
