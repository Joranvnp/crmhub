"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import apiClient from "@/libs/api";

const STATUSES = ["applied", "interview", "offer", "rejected"];

export default function UpdateStatus({
  id,
  current,
}: {
  id: string;
  current: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(current);
  const [loading, setLoading] = useState(false);

  const onChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value;
    setStatus(newStatus);
    setLoading(true);
    try {
      await apiClient.post("/modules/resume-track/update-status", {
        id,
        status: newStatus,
      });
      router.refresh();
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la mise à jour du statut");
      setStatus(current); // rollback si erreur
    } finally {
      setLoading(false);
    }
  };

  return (
    <select
      value={status}
      onChange={onChange}
      disabled={loading}
      className="border rounded px-2 py-1 text-sm"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
