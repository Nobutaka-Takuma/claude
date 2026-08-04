"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ChallengeVoteButtons({
  challengeId,
  homeLabel,
  awayLabel,
}: {
  challengeId: string;
  homeLabel: string;
  awayLabel: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function vote(outcome: "home" | "draw" | "away") {
    setSubmitting(outcome);
    setError(null);
    const res = await fetch(`/api/challenges/${challengeId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ votedOutcome: outcome }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "unknown" }));
      setError(body.error === "already_voted" ? "既に投票済みです" : "投票できませんでした");
      setSubmitting(null);
      return;
    }
    setSubmitting(null);
    router.refresh();
  }

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ["home", homeLabel],
            ["draw", "引分"],
            ["away", awayLabel],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            disabled={submitting !== null}
            onClick={() => vote(key)}
            className="text-xs font-bold py-2 rounded-lg border border-line-strong text-ink-muted disabled:opacity-50 truncate"
          >
            {submitting === key ? "…" : label}に投票
          </button>
        ))}
      </div>
      {error && <p className="text-[11px] text-neg">{error}</p>}
    </div>
  );
}
