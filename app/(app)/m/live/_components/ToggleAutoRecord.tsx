"use client";

import { useState } from "react";

export default function ToggleAutoRecord({
  linkId,
  initial,
  onChanged,
}: {
  linkId: string;
  initial: boolean;
  onChanged?: (v: boolean) => void;
}) {
  const [enabled, setEnabled] = useState(!!initial);
  const [loading, setLoading] = useState(false);

  return (
    <button
      className={`px-3 py-1 rounded border ${
        enabled ? "bg-black text-white" : ""
      }`}
      disabled={loading}
      onClick={async () => {
        if (loading) return;
        setLoading(true);
        try {
          const next = !enabled;
          const r = await fetch("/api/modules/live/record/toggle-auto", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: linkId, enabled: next }),
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) {
            alert("Erreur: " + (j?.error || r.status));
            return;
          }
          setEnabled(next);
          onChanged?.(next);
        } finally {
          setLoading(false);
        }
      }}
    >
      {enabled ? "Auto ON" : "Auto OFF"}
    </button>
  );
}
