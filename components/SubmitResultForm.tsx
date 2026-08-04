"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { OutcomeOption } from "@/lib/types";
import { apiErrorMessage, isAuthError } from "@/lib/errorMessages";

export default function SubmitResultForm({
  marketId,
  outcomeOptions,
  bond,
  disputeWindowHours,
  isAdmin,
  balance,
}: {
  marketId: string;
  outcomeOptions: OutcomeOption[];
  bond: number;
  disputeWindowHours: number;
  isAdmin: boolean;
  balance: number;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requiredBond = isAdmin ? 0 : bond;
  const canAfford = balance >= requiredBond;

  async function submit(outcome: string) {
    const label = outcomeOptions.find((o) => o.key === outcome)?.label ?? outcome;
    const confirmText = requiredBond
      ? `「${label}」を結果として提案します。\n保証金 ${requiredBond}pt を預けます（判定が支持されれば返却、DAO投票で覆されたら没収されます）。よろしいですか？`
      : `「${label}」を結果として提案します。よろしいですか？`;
    if (!confirm(confirmText)) return;

    setSubmitting(outcome);
    setError(null);
    const res = await fetch(`/api/markets/${marketId}/submit-result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "unknown" }));
      if (isAuthError(body.error)) {
        router.push("/login");
        return;
      }
      setError(apiErrorMessage(body.error, "判定を提案できませんでした。"));
      setSubmitting(null);
      return;
    }
    setSubmitting(null);
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-gold/50 bg-gold-soft p-4 space-y-2">
      <h2 className="text-sm font-bold text-gold">この試合・お題の結果を提案する</h2>
      <p className="text-[11px] text-ink-muted">
        ベットは締め切られましたが、まだ結果が確定していません。結果を知っている人が判定を提案してください。
        提案後 {disputeWindowHours} 時間以内に異議が出なければ自動的に確定・精算されます。
        異議が出た場合はDAO投票で最終決定します。
      </p>

      {requiredBond > 0 && (
        <p className="text-[11px] text-ink-muted">
          提案には保証金 <span className="font-mono-num font-bold">{requiredBond}pt</span> が必要です。
          判定が支持されれば全額返却、DAO投票で覆された場合は没収されます。
          {!canAfford && (
            <span className="text-neg block mt-0.5">
              残高が不足しています（保有 {balance.toLocaleString("ja-JP")}pt）。
            </span>
          )}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 pt-1">
        {outcomeOptions.map((o) => (
          <button
            key={o.key}
            type="button"
            disabled={submitting !== null || !canAfford}
            onClick={() => submit(o.key)}
            className="text-xs font-bold py-2.5 rounded-lg bg-surface border border-gold text-gold disabled:opacity-50 truncate"
          >
            {submitting === o.key ? "…" : o.label}
          </button>
        ))}
      </div>
      {error && <p className="text-[11px] text-neg">{error}</p>}
    </section>
  );
}
