"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiErrorMessage, readErrorBody } from "@/lib/errorMessages";

export default function VoteProposalButton({
  marketId,
  alreadyVoted,
}: {
  marketId: string;
  alreadyVoted: boolean;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (alreadyVoted) {
    return (
      <button disabled className="text-[11px] font-semibold text-ink-faint border border-line rounded-full px-3 py-1">
        賛成済み
      </button>
    );
  }

  async function vote() {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/markets/${marketId}/vote`, { method: "POST" });
    if (!res.ok) {
      const body = await readErrorBody(res);
      setError(apiErrorMessage(body.error, "投票できませんでした。", body.detail));
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    router.refresh();
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={vote}
        disabled={submitting}
        className="text-[11px] font-semibold text-white bg-accent rounded-full px-3 py-1 disabled:opacity-50"
      >
        {submitting ? "…" : "賛成する"}
      </button>
      {error && <p className="text-[10px] text-neg mt-1">{error}</p>}
    </div>
  );
}
