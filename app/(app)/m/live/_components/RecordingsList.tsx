"use client";

import { useEffect, useState } from "react";

type RecordingItem = {
  id: string;
  status: "queued" | "recording" | "completed" | "error" | "cancelled";
  file_path: string | null;
  bytes: number | null;
  created_at: string;
  ended_at: string | null;
  auto: boolean | null;
};

async function fetchList(linkId: string): Promise<RecordingItem[]> {
  const r = await fetch(
    `/api/modules/live/record/list-by-link?linkId=${encodeURIComponent(
      linkId
    )}`,
    { cache: "no-store" }
  );
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error || r.statusText);
  return j?.items || [];
}

async function getSigned(path: string) {
  const r = await fetch(
    `/api/modules/live/record/signed-url?path=${encodeURIComponent(path)}`
  );
  const j = await r.json();
  if (j?.url) window.open(j.url, "_blank");
  else alert("Impossible de générer le lien signé");
}

function fmtBytes(x?: number | null) {
  if (!x || x <= 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let n = x;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(1)} ${units[i]}`;
}

export default function RecordingsList({ linkId }: { linkId: string }) {
  const [items, setItems] = useState<RecordingItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const list = await fetchList(linkId);
      setItems(list);
    } catch (e: any) {
      alert("Erreur chargement enregistrements: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [linkId]);

  if (loading) return <div className="text-sm text-gray-600">Chargement…</div>;
  if (!items.length)
    return (
      <div className="text-sm text-gray-600">
        Aucun enregistrement pour l’instant.
      </div>
    );

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500">
            <th className="py-2 pr-4">Statut</th>
            <th className="py-2 pr-4">Créé</th>
            <th className="py-2 pr-4">Terminé</th>
            <th className="py-2 pr-4">Taille</th>
            <th className="py-2 pr-4">Auto</th>
            <th className="py-2 pr-4">Fichier</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-t">
              <td className="py-2 pr-4">
                {it.status === "completed"
                  ? "✅"
                  : it.status === "recording"
                  ? "⏺️"
                  : it.status === "queued"
                  ? "⏳"
                  : it.status === "error"
                  ? "❌"
                  : "–"}{" "}
                <span className="uppercase">{it.status}</span>
              </td>
              <td className="py-2 pr-4">
                {new Date(it.created_at).toLocaleString()}
              </td>
              <td className="py-2 pr-4">
                {it.ended_at ? new Date(it.ended_at).toLocaleString() : "-"}
              </td>
              <td className="py-2 pr-4">{fmtBytes(it.bytes)}</td>
              <td className="py-2 pr-4">{it.auto ? "Oui" : "Non"}</td>
              <td className="py-2 pr-4">
                {it.file_path ? (
                  <button
                    onClick={() => getSigned(it.file_path!)}
                    className="px-2 py-1 rounded border"
                    title={it.file_path || ""}
                  >
                    Télécharger (signé)
                  </button>
                ) : (
                  <span className="text-gray-500">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3">
        <button onClick={load} className="px-2 py-1 rounded border text-xs">
          Rafraîchir
        </button>
      </div>
    </div>
  );
}
