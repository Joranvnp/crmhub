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

  const body = await req.json();
  const company = String(body.company || "").trim();
  const role = String(body.role || "").trim();
  const status = String(body.status || "applied");
  const applied_at = body.applied_at || null; // "YYYY-MM-DD" ou null
  const next_action_at = body.next_action_at || null; // "YYYY-MM-DDTHH:mm" ou null
  const notes = body.notes || null;

  if (!company || !role) {
    return NextResponse.json(
      { error: "Company and role required" },
      { status: 400 }
    );
  }

  const { data, error } = await (await supabase)
    .from("rt_apps")
    .insert({
      user_id: user.id,
      company,
      role,
      status,
      applied_at,
      next_action_at,
      notes,
    })
    .select();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 200 });
}
