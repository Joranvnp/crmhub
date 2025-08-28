import { createClient } from "@/libs/supabase/server";
import Link from "next/link";
import CreateForm from "./_client/CreateForm";
import DeleteButton from "./_client/DeleteButton";
import UpdateStatus from "./_client/UpdateStatus";
import UpdateNotes from "./_client/UpdateNotes";

export const dynamic = "force-dynamic";

export default async function ResumeTrackPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await (await supabase).auth.getUser();

  if (!user) {
    return (
      <main className="p-8">
        Non connecté.{" "}
        <Link href="/login" className="underline">
          Se connecter
        </Link>
      </main>
    );
  }

  const { data: items, error } = await (await supabase)
    .from("rt_apps")
    .select("id, company, role, status, applied_at, next_action_at, notes")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main className="p-8">
        <p className="text-red-600">Erreur: {error.message}</p>
      </main>
    );
  }

  return (
    <main className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold">ResumeTrack</h1>
        <p className="text-gray-600">Suis tes candidatures simplement.</p>
      </header>

      {/* Formulaire */}
      <section className="border rounded-xl bg-white p-6 shadow-sm">
        <h2 className="font-semibold mb-4">Ajouter une candidature</h2>
        <CreateForm />
      </section>

      {/* Liste */}
      <section className="border rounded-xl bg-white shadow-sm overflow-hidden">
        {/* Vue desktop */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="text-left p-3">Entreprise</th>
                <th className="text-left p-3">Poste</th>
                <th className="text-left p-3">Statut</th>
                <th className="text-left p-3">Candidature</th>
                <th className="text-left p-3">Prochaine action</th>
                <th className="text-left p-3">Notes</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {(items ?? []).map((it) => (
                <tr key={it.id} className="border-t">
                  {/* Entreprise */}
                  <td className="p-3 font-medium">{it.company}</td>

                  {/* Poste */}
                  <td className="p-3">{it.role}</td>

                  {/* Statut */}
                  <td className="p-3">
                    <UpdateStatus id={it.id} current={it.status} />
                  </td>

                  {/* Date candidature */}
                  <td className="p-3 text-gray-600">{it.applied_at ?? "-"}</td>

                  {/* Prochaine action */}
                  <td className="p-3">
                    {it.next_action_at ? (
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          new Date(it.next_action_at) < new Date()
                            ? "bg-red-100 text-red-800"
                            : "bg-green-100 text-green-800"
                        }`}
                      >
                        {String(it.next_action_at)
                          .replace("T", " ")
                          .slice(0, 16)}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>

                  {/* Notes */}
                  <td className="p-3 max-w-xs">
                    <UpdateNotes id={it.id} current={it.notes ?? ""} />
                  </td>

                  {/* Actions */}
                  <td className="p-3 text-right">
                    <DeleteButton id={it.id} />
                  </td>
                </tr>
              ))}
              {(items ?? []).length === 0 && (
                <tr>
                  <td className="p-4 text-gray-500" colSpan={7}>
                    Aucune candidature pour l’instant.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Vue mobile (cartes) */}
        <div className="md:hidden divide-y">
          {(items ?? []).map((it) => (
            <div key={it.id} className="p-4 space-y-2">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold">{it.company}</h3>
                <DeleteButton id={it.id} />
              </div>
              <p className="text-sm text-gray-600">{it.role}</p>
              <div className="flex flex-wrap gap-2 text-xs">
                <UpdateStatus id={it.id} current={it.status} />
                {it.applied_at && (
                  <span className="text-gray-500">📅 {it.applied_at}</span>
                )}
                {it.next_action_at && (
                  <span
                    className={`px-2 py-1 rounded ${
                      new Date(it.next_action_at) < new Date()
                        ? "bg-red-100 text-red-800"
                        : "bg-green-100 text-green-800"
                    }`}
                  >
                    {String(it.next_action_at).replace("T", " ").slice(0, 16)}
                  </span>
                )}
              </div>
              <UpdateNotes id={it.id} current={it.notes ?? ""} />
            </div>
          ))}
          {(items ?? []).length === 0 && (
            <p className="p-4 text-gray-500">
              Aucune candidature pour l’instant.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
