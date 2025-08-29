"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import apiClient from "@/libs/api";

export default function UpdateNotes({
  id,
  current,
}: {
  id: string;
  current: string;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(current || "");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSave = async () => {
    setLoading(true);
    try {
      await apiClient.post("/modules/resume-track/update-notes", { id, notes });
      setEditing(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  if (editing) {
    return (
      <div className="flex gap-2">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="border rounded px-2 py-1 w-full text-sm"
        />
        <button
          onClick={onSave}
          disabled={loading}
          className="px-2 py-1 bg-blue-600 text-white rounded text-sm"
        >
          {loading ? "..." : "OK"}
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className="cursor-pointer text-sm text-gray-700"
    >
      {notes || <span className="text-gray-400">Clique pour ajouter</span>}
    </div>
  );
}
