import Link from "next/link";
import { createClient } from "@/libs/supabase/server";
import { addLink, deleteLink, checkLink } from "./actions";
import AttachM3U8Button from "@/app/(app)/m/live/_components/AttachM3U8Button";
import VerifyButton from "@/app/(app)/m/live/_components/VerifyButton";

export const dynamic = "force-dynamic";

export default async function LivePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <main className="p-6">
        Non connecté.{" "}
        <Link href="/login" className="underline">
          Se connecter
        </Link>
      </main>
    );
  }

  const { data: rows } = await supabase
    .from("live_links")
    .select("id, url, title, status, last_m3u8, last_checked_at, probe_token")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <main className="space-y-6">
      {/* Ajouter un lien */}
      <section className="border rounded-xl bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold mb-3">Ajouter un lien</h1>
        <form action={addLink} className="grid gap-3 sm:grid-cols-2">
          <input
            name="url"
            required
            placeholder="URL de la page ou du .m3u8"
            className="border rounded px-3 py-2"
          />
          <input
            name="title"
            placeholder="Titre (optionnel)"
            className="border rounded px-3 py-2"
          />
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="px-4 py-2 rounded bg-black text-white"
            >
              Ajouter
            </button>
          </div>
        </form>
      </section>

      {/* Liste */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Mes liens</h2>
        <div className="grid gap-4">
          {(rows ?? []).map((r) => (
            <div
              key={r.id}
              className="border rounded-xl bg-white p-4 shadow-sm flex flex-col gap-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{r.title || r.url}</div>
                  <div className="text-sm text-gray-600 break-all">{r.url}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs px-2 py-1 rounded ${
                      r.status === "online"
                        ? "bg-green-100 text-green-700"
                        : r.status === "blocked"
                        ? "bg-yellow-100 text-yellow-700"
                        : r.status === "offline"
                        ? "bg-gray-100 text-gray-700"
                        : r.status === "error"
                        ? "bg-red-100 text-red-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {r.status}
                  </span>

                  {r.status === "online" && r.last_m3u8 && (
                    <Link
                      href={`/m/live/player?src=${encodeURIComponent(
                        r.last_m3u8
                      )}`}
                      className="px-3 py-1 rounded bg-black text-white text-xs"
                    >
                      Ouvrir le player
                    </Link>
                  )}
                </div>
              </div>

              {r.last_m3u8 && (
                <div className="text-sm">
                  .m3u8 détecté:&nbsp;
                  <Link
                    href={`/m/live/player?src=${encodeURIComponent(
                      r.last_m3u8
                    )}`}
                    className="underline text-blue-600"
                  >
                    Ouvrir dans le player
                  </Link>
                </div>
              )}

              <div className="flex items-center gap-3">
                {/* <form action={checkLink}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="url" value={r.url} />
                  <button className="px-3 py-1 rounded border">Vérifier</button>
                  <Link
                    href={`/m/live/probe/${r.id}`}
                    className="px-3 py-1 rounded border"
                  >
                    Probe (client)
                  </Link>
                </form> */}

                <VerifyButton
                  id={r.id}
                  url={r.url}
                  probeToken={r.probe_token}
                />

                <AttachM3U8Button id={r.id} />

                <form action={deleteLink}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="px-3 py-1 rounded border text-red-600">
                    Supprimer
                  </button>
                </form>

                {r.status === "blocked" && (
                  <Link href="/m/live/snippet" className="text-sm underline">
                    Utiliser le snippet
                  </Link>
                )}
              </div>

              <div className="text-xs text-gray-500">
                Dernière vérif :{" "}
                {r.last_checked_at
                  ? new Date(r.last_checked_at).toLocaleString()
                  : "—"}
              </div>
            </div>
          ))}
          {(rows ?? []).length === 0 && (
            <div className="text-gray-600">Aucun lien pour l’instant.</div>
          )}
        </div>
      </section>
    </main>
  );
}
