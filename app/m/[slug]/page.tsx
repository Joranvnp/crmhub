import { createClient } from "@/libs/supabase/server";
import { ALL_MODULES } from "@/libs/modules";
import Link from "next/link";

export const dynamic = "force-dynamic";

type Params = { slug: string };

// 👇 params is now a Promise — await it first
export default async function ModulePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;

  const mod = ALL_MODULES.find((m) => m.slug === slug);
  if (!mod) {
    return <main className="p-8 text-center">❌ Module inconnu.</main>;
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await (await supabase).auth.getUser();

  if (!user) {
    return (
      <main className="p-8 text-center">
        Non connecté.{" "}
        <Link href="/login" className="underline">
          Se connecter
        </Link>
      </main>
    );
  }

  const { data: row } = await (await supabase)
    .from("modules_enabled")
    .select("enabled")
    .eq("user_id", user.id)
    .eq("module_slug", slug)
    .maybeSingle();

  const isOn = !!row?.enabled;

  return (
    <main className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      <header>
        <h1 className="text-3xl font-bold">{mod.name}</h1>
        <p className="text-gray-600">{mod.description}</p>
      </header>

      {!isOn ? (
        <div className="p-6 border rounded-xl bg-yellow-50 text-center">
          <p className="mb-4">⚠️ Ce module n’est pas activé.</p>
          <Link
            href="/modules"
            className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            Activer le module
          </Link>
        </div>
      ) : (
        <div className="p-6 border rounded-xl bg-white shadow-sm">
          <p className="mb-2">
            🎉 Placeholder pour <b>{mod.slug}</b>.
          </p>
          <p className="text-sm text-gray-600">
            Remplace ce contenu dans{" "}
            <code>app/(app)/m/{mod.slug}/page.tsx</code> par ton vrai module.
          </p>
          <div className="mt-4">
            <Link
              href="/modules"
              className="px-3 py-2 rounded border inline-block hover:bg-gray-50"
            >
              Retour aux modules
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
