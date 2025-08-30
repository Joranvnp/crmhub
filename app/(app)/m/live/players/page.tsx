// app/(app)/m/live/players/page.tsx
import Link from "next/link";
import { createClient } from "@/libs/supabase/server";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  title: string | null;
  url: string;
  last_m3u8: string | null;
  status: string | null;
  created_at: string | null;
};

export default async function PlayersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-xl font-semibold">Players</h1>
        <p className="text-gray-600">Vous n’êtes pas connecté.</p>
      </main>
    );
  }

  const { data, error } = await supabase
    .from("live_links")
    .select("id,title,url,last_m3u8,status,created_at")
    .eq("user_id", user.id)
    .not("last_m3u8", "is", null)
    .order("created_at", { ascending: false });

  const rows = (data || []).filter((r: Row) => !!r.last_m3u8) as Row[];

  return (
    <main className="max-w-[1400px] mx-auto p-6 space-y-4">
      {/* ↩️ Flèche retour */}
      <div className="flex items-center justify-between">
        <Link href="/m/live" className="text-sm underline">
          ← Retour
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Players (flux avec .m3u8)</h1>
        <div className="text-sm text-gray-600">{rows.length} flux</div>
      </div>

      {error ? (
        <div className="text-red-600">Erreur DB: {error.message}</div>
      ) : rows.length === 0 ? (
        <div className="text-gray-600">
          Aucun flux avec <code>last_m3u8</code>.
        </div>
      ) : (
        // On sépare la partie client pour éviter les erreurs TS côté serveur
        <PlayersGrid
          items={rows.map((r) => ({
            id: r.id,
            title: r.title || "(sans titre)",
            pageUrl: r.url,
            m3u8: r.last_m3u8!,
            status: r.status || "unknown",
          }))}
        />
      )}
    </main>
  );
}

import PlayersGrid from "./players_grid";
