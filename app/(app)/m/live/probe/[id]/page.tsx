import Link from "next/link";
import { createClient } from "@/libs/supabase/server";
import ProbeClient from "./probe-client";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: { id: string } }) {
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

  const { data: row } = await supabase
    .from("live_links")
    .select("id, url, title, probe_token")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (!row) {
    return <main className="p-6">Lien introuvable.</main>;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || ""; // ex: https://crmhub.dev
  return (
    <ProbeClient
      id={row.id}
      title={row.title}
      url={row.url}
      probeToken={row.probe_token}
      appUrl={appUrl}
    />
  );
}
