import Link from "next/link";
import { createClient } from "@/libs/supabase/server";
import { ALL_MODULES } from "@/libs/modules";
import { toggleModule } from "./actions";

export const dynamic = "force-dynamic";

export default async function ModulesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
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

  const { data: rows } = await supabase
    .from("modules_enabled")
    .select("module_slug, enabled")
    .eq("user_id", user.id);

  const enabled = new Map<string, boolean>();
  (rows ?? []).forEach((r) => enabled.set(r.module_slug, !!r.enabled));

  return (
    <main className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold mb-2">Tous les modules</h1>
        <p className="text-gray-600">
          Active les projets que tu veux utiliser.
        </p>
      </header>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {ALL_MODULES.map((m) => {
          const isOn = enabled.get(m.slug) ?? false;
          return (
            <div
              key={m.slug}
              className="border rounded-xl bg-white p-6 shadow-sm hover:shadow-md transition flex flex-col gap-3"
            >
              <div>
                <div className="font-semibold text-lg">{m.name}</div>
                <p className="text-sm text-gray-600">{m.description}</p>
              </div>

              <div className="flex items-center justify-between">
                {isOn && (
                  <Link
                    href={`/m/${m.slug}`}
                    className="text-sm underline text-blue-600"
                  >
                    Ouvrir
                  </Link>
                )}
                <form action={toggleModule}>
                  <input type="hidden" name="slug" value={m.slug} />
                  <input
                    type="hidden"
                    name="enable"
                    value={(!isOn).toString()}
                  />
                  <button
                    type="submit"
                    className={`px-3 py-1 rounded text-sm ${
                      isOn ? "bg-green-600 text-white" : "bg-gray-200"
                    }`}
                  >
                    {isOn ? "Activé" : "Activer"}
                  </button>
                </form>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
