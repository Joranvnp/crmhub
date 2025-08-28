import { createClient } from "@/libs/supabase/server";
import { ALL_MODULES } from "@/libs/modules";
import Link from "next/link";

export const dynamic = "force-dynamic";

// This is a private page: It's protected by the layout.js component which ensures the user is authenticated.
// It's a server compoment which means you can fetch data (like the user profile) before the page is rendered.
// See https://shipfa.st/docs/tutorials/private-page
export default async function Dashboard() {
  const supabase = createClient();
  const {
    data: { user },
  } = await (await supabase).auth.getUser();

  if (!user) {
    return (
      <main className="min-h-screen p-8">
        <p>
          Non connecté.
          <Link href="/login" className="underline">
            Se connecter
          </Link>
        </p>
      </main>
    );
  }

  const { data: enabledRows } = await (await supabase)
    .from("modules_enabled")
    .select("module_slug")
    .eq("user_id", user.id)
    .eq("enabled", true);

  const enabledSlugs = new Set((enabledRows ?? []).map((r) => r.module_slug));

  return (
    <main className="min-h-screen p-8 pb-24">
      <div className="max-w-6xl mx-auto px-6 py-10 space-y-10">
        {/* Header */}
        <header>
          <h1 className="text-4xl font-extrabold mb-2">
            👋 Bienvenue {user.email}
          </h1>
          <p className="text-gray-600">
            Gère tes projets et accède rapidement à tes modules activés.
          </p>
        </header>

        {/* Actions rapides */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Actions rapides</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <Link
              href="/modules"
              className="group border rounded-xl bg-white p-6 shadow-sm hover:shadow-md transition"
            >
              <div className="font-semibold text-lg group-hover:text-blue-600">
                📦 Modules
              </div>
              <p className="text-sm text-gray-600">
                Activer ou désactiver tes projets
              </p>
            </Link>
            <Link
              href="/billing"
              className="group border rounded-xl bg-white p-6 shadow-sm hover:shadow-md transition"
            >
              <div className="font-semibold text-lg group-hover:text-blue-600">
                💳 Abonnement
              </div>
              <p className="text-sm text-gray-600">
                Voir ton plan et gérer la facturation
              </p>
            </Link>
            <Link
              href="/settings"
              className="group border rounded-xl bg-white p-6 shadow-sm hover:shadow-md transition"
            >
              <div className="font-semibold text-lg group-hover:text-blue-600">
                ⚙️ Paramètres
              </div>
              <p className="text-sm text-gray-600">Profil, préférences</p>
            </Link>
          </div>
        </section>

        {/* Modules activés */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Modules activés</h2>
            <Link
              href="/modules"
              className="text-sm underline hover:text-blue-600"
            >
              Gérer mes modules
            </Link>
          </div>

          {enabledSlugs.size === 0 ? (
            <div className="border rounded-xl bg-white p-8 text-center text-gray-600">
              <p className="mb-4">Aucun module activé pour le moment.</p>
              <Link
                href="/modules"
                className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
              >
                Activer des modules
              </Link>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...enabledSlugs].map((slug) => {
                const mod = ALL_MODULES.find((m) => m.slug === slug);
                return (
                  <Link
                    key={slug}
                    href={`/m/${slug}`}
                    className="group border rounded-xl bg-white p-6 shadow-sm hover:shadow-md transition"
                  >
                    <div className="font-semibold text-lg group-hover:text-blue-600">
                      {mod?.name ?? slug}
                    </div>
                    <p className="text-sm text-gray-600">{mod?.description}</p>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
