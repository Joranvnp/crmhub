import { NextResponse } from "next/server";
import { createClient } from "@/libs/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await (await supabase).auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const { data: link } = await (await supabase)
    .from("live_links")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (!link) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const target = link.last_m3u8 || link.url;
  let status = "unknown";
  let last_error_code: string | null = null;

  try {
    // GET > HEAD (HEAD est souvent filtré)
    const res = await fetch(target, { method: "GET", redirect: "follow" });
    if (res.ok) status = "online";
    else {
      status = ["401", "403", "429"].includes(String(res.status))
        ? "blocked"
        : res.status === 404
        ? "invalid"
        : "error";
      last_error_code = String(res.status);
    }
  } catch (e: any) {
    const msg = (e?.message || "").toLowerCase();
    if (msg.includes("cors")) {
      status = "cors_error";
      last_error_code = "cors";
    } else {
      status = "blocked";
      last_error_code = "network";
    }
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
}
