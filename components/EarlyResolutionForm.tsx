"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { OutcomeOption } from "@/lib/types";
import { apiErrorMessage, isAuthError, readErrorBody } from "@/lib/errorMessages";

// Shown while a market is still taking bets. Used when the answer is
// already known — a postponed match, a result announced early — so the
// market shouldn't keep taking bets on a settled question until kickoff.
export default function EarlyResolutionForm({
  marketId,
  outcomeOptions,
  bond,
  votingHours,
  balance,
}: {
  marketId: string;
  outcomeOptions: OutcomeOption[];
  bond: number;
  votingHours: number;
  balance: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canAfford = balance >= bond;

  async function submit(outcome: string) {
    const label = outcomeOptions.find((o) => o.key === outcome)?.label ?? outcome;
    if (
      !confirm(
        `「${label}」で結果が確定したとして、早期確定を申請します。\n\n` +
          `・保証金 ${bond}pt を預けます\n` +
          `・このマーケットの受付は直ちに締め切られます\n` +
          `・${votingHours}時間のDAO投票で最終決定します\n` +
          `・投票で覆された場合、保証金は没収されます\n\nよろしいですか？`
      )
    ) {
      return;
    }

    setSubmitting(outcome);
    setError(null);
    const res = await fetch(`/api/markets/${marketId}/early-resolution`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome }),
    });
    if (!res.ok) {
      const body = await readErrorBody(res);
      if (isAuthError(body.error)) {
        router.push("/login");
        return;
      }
      setError(apiErrorMessage(body.error, "早期確定を申請できませんでした。", body.detail));
      setSubmitting(null);
      return;
    }
    setSubmitting(null);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-[11px] font-semibold text-ink-muted border border-dashed border-line-strong rounded-lg py-2 hover:border-gold hover:text-gold"
      >
        締切前に結果が判明した場合はこちら（早期確定を申請）
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-gold/50 bg-gold-soft p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-gold">早期確定を申請する</span>
        <button type="button" onClick={() => setOpen(false)} className="text-[11px] text-ink-faint">
          閉じる
        </button>
      </div>
      <p className="text-[11px] text-ink-muted">
        すでに結果が判明している場合、保証金 {bond}pt を預けて受付を即時締め切り、
        {votingHours}時間のDAO投票で結果を確定させられます。投票で覆された場合、保証金は没収され、
        その70%が異議側に渡ります。
        {!canAfford && (
          <span className="block text-neg mt-0.5">
            残高が不足しています（保有 {balance.toLocaleString("ja-JP")}pt）。
          </span>
        )}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {outcomeOptions.map((o) => (
          <button
            key={o.key}
            type="button"
            disabled={submitting !== null || !canAfford}
            onClick={() => submit(o.key)}
            className="text-xs font-bold py-2 rounded-lg bg-surface border border-gold text-gold disabled:opacity-50 truncate"
          >
            {submitting === o.key ? "…" : `${o.label} で確定`}
          </button>
        ))}
      </div>
      {error && <p className="text-[11px] text-neg">{error}</p>}
    </div>
  );
}
