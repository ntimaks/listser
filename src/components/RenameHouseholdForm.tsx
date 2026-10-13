"use client";

import { useState, useTransition } from "react";
import { renameHousehold } from "@/app/actions";

export default function RenameHouseholdForm({
  householdId,
  name,
}: {
  householdId: string;
  name: string;
}) {
  const [value, setValue] = useState(name);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  const trimmed = value.trim();
  const unchanged = trimmed === name;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmed || unchanged) return;
    setError(false);
    startTransition(async () => {
      try {
        await renameHousehold(householdId, trimmed);
      } catch {
        setError(true);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        required
        maxLength={80}
        aria-label="Household name"
        className="field"
      />
      {error && (
        <p className="t-meta text-[var(--term-red)]">
          {"// "}couldn&rsquo;t rename. try again.
        </p>
      )}
      <button
        type="submit"
        disabled={pending || !trimmed || unchanged}
        className="btn btn-acid w-full"
      >
        {pending ? "Saving…" : "Rename"}
      </button>
    </form>
  );
}
