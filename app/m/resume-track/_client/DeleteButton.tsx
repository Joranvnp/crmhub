"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import apiClient from "@/libs/api";

export default function DeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const onDelete = async () => {
    if (!confirm("Supprimer cette candidature ?")) return;
    setLoading(true);
    try {
      await apiClient.post("/modules/resume-track/delete", { id });
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={onDelete}
      disabled={loading}
      className="px-2 py-1 rounded border hover:bg-gray-50"
    >
      {loading ? "..." : "Supprimer"}
    </button>
  );
}
