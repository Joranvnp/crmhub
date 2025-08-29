"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import apiClient from "@/libs/api";

export default function CreateForm() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("applied");
  const [appliedAt, setAppliedAt] = useState<string>("");
  const [nextActionAt, setNextActionAt] = useState<string>("");
  const [notes, setNotes] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await apiClient.post("/modules/resume-track", {
        company,
        role,
        status,
        applied_at: appliedAt || null,
        next_action_at: nextActionAt || null,
        notes: notes || null,
      });

      // reset form
      setCompany("");
      setRole("");
      setStatus("applied");
      setAppliedAt("");
      setNextActionAt("");
      setNotes("");
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* Entreprise */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Entreprise <span className="text-red-500">*</span>
        </label>
        <input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          type="text"
          placeholder="Ex: OpenAI"
          required
          className="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
        />
      </div>

      {/* Poste */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Poste <span className="text-red-500">*</span>
        </label>
        <input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          type="text"
          placeholder="Ex: Fullstack Developer"
          required
          className="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
        />
      </div>

      {/* Statut */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Statut
        </label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
        >
          <option value="applied">Candidature envoyée</option>
          <option value="interview">Entretien</option>
          <option value="offer">Offre reçue</option>
          <option value="rejected">Refusée</option>
        </select>
      </div>

      {/* Dates */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Date de candidature
          </label>
          <input
            type="date"
            value={appliedAt}
            onChange={(e) => setAppliedAt(e.target.value)}
            className="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Prochaine action
          </label>
          <input
            type="datetime-local"
            value={nextActionAt}
            onChange={(e) => setNextActionAt(e.target.value)}
            className="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex: Entretien prévu avec HR, relancer le 15/09..."
          rows={3}
          className="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
        />
      </div>

      {/* Submit */}
      <div>
        <button
          type="submit"
          disabled={isLoading}
          className="w-full sm:w-auto px-6 py-2 rounded bg-blue-600 text-white font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {isLoading ? "Ajout..." : "Ajouter la candidature"}
        </button>
      </div>
    </form>
  );
}
