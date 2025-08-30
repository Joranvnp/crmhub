// app/api/modules/live/peek/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/libs/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

    const { data, error } = await supabase
      .from("live_links")
      .select("id,status,last_m3u8") // minimal & safe
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || !data)
      return NextResponse.json({ error: "not_found" }, { status: 404 });

    return NextResponse.json({ data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: "server_error", detail: String(e?.message || e) },
      { status: 500 }
    );
  }
}
