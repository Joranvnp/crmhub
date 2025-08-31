"use client";
import { useState } from "react";

export default function StartAllOnlineButton() {
  const [loading, setLoading] = useState(false);
  return (
    <button
      className="px-3 py-1 rounded border"
      disabled={loading}
      onClick={async () => {
        if (loading) return;
        setLoading(true);
        try {
          const r = await fetch("/api/modules/live/record/start-many", {
            method: "POST",
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) return alert("Erreur: " + (j?.error || r.status));
          alert(`Jobs créés: ${(j?.jobs || []).length} ✅`);
        } finally {
          setLoading(false);
        }
      }}
    >
      Tout télécharger (en ligne)
    </button>
  );
}
