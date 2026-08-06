"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiErrorMessage } from "@/lib/errorMessages";
import type { OutcomeOption } from "@/lib/types";

export default function ChallengeVoteButtons({
  challengeId,
  outcomeOptions,
}: {
  challengeId: string;
  outcomeOptions: OutcomeOption[];
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function vote(outcome: string) {
    setSubmitting(outcome);
    setError(null);
    const res = await fetch(`/api/challenges/${challengeId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ votedOutcome: outcome }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "unknown" }));
      setError(apiErrorMessage(body.error, "投票できませんでした。", body.detail));
      setSubmitting(null);
      return;
    }
    setSubmitting(null);
    router.refresh();
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        {outcomeOptions.map((o) => (
          <button
            key={o.key}
            type="button"
            disabled={submitting !== null}
            onClick={() => vote(o.key)}
            className="flex-1 min-w-[5.5rem] text-xs font-bold py-2 px-2 rounded-lg border border-line-strong text-ink-muted disabled:opacity-50 truncate"
          >
            {submitting === o.key ? "…" : `${o.label}に投票`}
          </button>
        ))}
      </div>
      {error && <p className="text-[11px] text-neg">{error}</p>}
    </div>
  );
}
