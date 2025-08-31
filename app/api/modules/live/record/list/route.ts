import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const linkId = searchParams.get("linkId");
  if (!linkId)
    return NextResponse.json({ error: "missing linkId" }, { status: 400 });

  const supa = createRouteHandlerClient({ cookies });
  const { data, error } = await supa
    .from("live_recordings")
    .select("id,status,file_path,bytes,created_at,ended_at,auto")
    .eq("link_id", linkId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}
