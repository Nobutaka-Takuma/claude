"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { OutcomeOption } from "@/lib/types";
import { apiErrorMessage, isAuthError, fieldErrorMessage, readErrorBody } from "@/lib/errorMessages";

export default function SubmitResultForm({
  marketId,
  outcomeOptions,
  bond,
  reward,
  disputeWindowHours,
  isAdmin,
  balance,
}: {
  marketId: string;
  outcomeOptions: OutcomeOption[];
  bond: number;
  reward: number;
  disputeWindowHours: number;
  isAdmin: boolean;
  balance: number;
}) {
  const router = useRouter();
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requiredBond = isAdmin ? 0 : bond;
  const canAfford = balance >= requiredBond;
  // Admins override out-of-band; everyone else has to show their source.
  const evidenceRequired = !isAdmin;
  const hasEvidence = evidenceUrl.trim().length > 0;

  async function submit(outcome: string) {
    const label = outcomeOptions.find((o) => o.key === outcome)?.label ?? outcome;
    const confirmText = requiredBond
      ? `「${label}」を結果として報告します。\n\n` +
        `・保証金 ${requiredBond}pt を預けます\n` +
        `・${disputeWindowHours}時間、異議が出なければ確定し、保証金の返却に加えて ${reward}pt を受け取ります\n` +
        `・DAO投票で覆された場合、保証金は没収されます\n\nよろしいですか？`
      : `「${label}」を結果として確定させます。よろしいですか？`;
    if (!confirm(confirmText)) return;

    setSubmitting(outcome);
    setError(null);
    const res = await fetch(`/api/markets/${marketId}/submit-result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        outcome,
        evidenceUrl: hasEvidence ? evidenceUrl.trim() : undefined,
      }),
    });
    if (!res.ok) {
      const body = await readErrorBody(res);
      if (isAuthError(body.error)) {
        router.push("/login");
        return;
      }
      setError(
        fieldErrorMessage(body.fields) ??
          apiErrorMessage(body.error, "結果を報告できませんでした。", body.detail)
      );
      setSubmitting(null);
      return;
    }
    setSubmitting(null);
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-gold/50 bg-gold-soft p-4 space-y-2">
      <h2 className="text-sm font-bold text-gold">この試合・お題の結果を報告する</h2>
      <p className="text-[11px] text-ink-muted">
        ベットは締め切られましたが、まだ結果が確定していません。結果を知っている人が報告してください。
        報告後 {disputeWindowHours} 時間以内に異議が出なければ自動的に確定・精算されます。
        異議が出た場合はDAO投票で最終決定します。
      </p>

      {requiredBond > 0 && (
        <p className="text-[11px] text-ink-muted">
          報告には保証金 <span className="font-mono-num font-bold">{requiredBond}pt</span> が必要です。
          報告が正しければ<span className="font-bold text-gold">全額返却＋{reward}ptの報酬</span>、
          DAO投票で覆された場合は没収されます。
          {!canAfford && (
            <span className="text-neg block mt-0.5">
              残高が不足しています（保有 {balance.toLocaleString("ja-JP")}pt）。
            </span>
          )}
        </p>
      )}

      <label className="block space-y-1 pt-1">
        <span className="text-xs text-ink-muted">証跡URL{evidenceRequired ? "" : "（任意）"}</span>
        <input
          type="url"
          inputMode="url"
          value={evidenceUrl}
          onChange={(e) => setEvidenceUrl(e.target.value)}
          placeholder="https://... 結果が確認できるニュース記事・公式ページ"
          className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm"
        />
        <span className="block text-[11px] text-ink-faint">
          他の人が異議を出すか判断できるように、結果の出典を残してください。
        </span>
      </label>

      <div className="grid grid-cols-2 gap-2 pt-1">
        {outcomeOptions.map((o) => (
          <button
            key={o.key}
            type="button"
            disabled={submitting !== null || !canAfford || (evidenceRequired && !hasEvidence)}
            onClick={() => submit(o.key)}
            className="text-xs font-bold py-2.5 rounded-lg bg-surface border border-gold text-gold disabled:opacity-50 truncate"
          >
            {submitting === o.key ? "…" : o.label}
          </button>
        ))}
      </div>
      {evidenceRequired && !hasEvidence && (
        <p className="text-[11px] text-ink-faint">証跡URLを入力すると報告できます。</p>
      )}
      {error && <p className="text-[11px] text-neg">{error}</p>}
    </section>
  );
}
