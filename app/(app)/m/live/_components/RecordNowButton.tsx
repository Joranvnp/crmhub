"use client";

import { useState } from "react";

export default function RecordNowButton({ linkId }: { linkId: string }) {
  const [loading, setLoading] = useState(false);

  return (
    <button
      className="px-3 py-1 rounded border"
      disabled={loading}
      onClick={async () => {
        if (loading) return;
        setLoading(true);
        try {
          const r = await fetch("/api/modules/live/record/start", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: linkId }),
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) {
            alert("Erreur: " + (j?.error || r.status));
            return;
          }
          alert("Téléchargement démarré (job) ✅");
        } finally {
          setLoading(false);
        }
      }}
    >
      Télécharger maintenant
    </button>
  );
}
