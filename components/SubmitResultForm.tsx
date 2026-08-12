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
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requiredBond = isAdmin ? 0 : bond;
  const canAfford = balance >= requiredBond;
  const hasEvidence = evidenceUrl.trim().length > 0;
  // 証跡URLの代わりに必須にした根拠のコメント。10文字は「あ」で埋められる
  // のを防ぐための下限で、日本語なら短い一文がちょうど収まる。
  const NOTE_MIN = 10;
  const noteOk = note.trim().length >= NOTE_MIN;

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
        resolutionNote: note.trim(),
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
        受付は締め切られましたが、まだ結果が確定していません。結果を知っている人が報告してください。
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

      {/* URLを探すのは面倒でも、何を見てそう判断したかを一文書くのは面倒では
          ない。証跡URLの代わりにこちらを必須にしている。これがないと、
          見ていなかった人は異議を出すかどうかを決められない。 */}
      <label className="block space-y-1 pt-1">
        <span className="text-xs text-ink-muted">
          どうしてその結果だと分かりましたか？<span className="text-neg ml-1">*</span>
        </span>
        <textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="例: 公式サイトの試合結果ページで 2-1 になっていました"
          maxLength={1000}
          className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm"
        />
        <span className="block text-[11px] text-ink-faint">
          他の人はこれを読んで、異議を出すかどうかを判断します。
          {!noteOk && note.length > 0 && (
            <span className="text-neg"> あと{NOTE_MIN - note.trim().length}文字</span>
          )}
        </span>
      </label>

      <label className="block space-y-1 pt-1">
        <span className="text-xs text-ink-muted">証跡URL（任意）</span>
        <input
          type="url"
          inputMode="url"
          value={evidenceUrl}
          onChange={(e) => setEvidenceUrl(e.target.value)}
          placeholder="https://... 結果が確認できるページ（なくても報告できます）"
          className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm"
        />
        <span className="block text-[11px] text-ink-faint">
          あれば他の人が確かめやすくなり、異議が出にくくなります。
        </span>
      </label>

      <div className="grid grid-cols-2 gap-2 pt-1">
        {outcomeOptions.map((o) => (
          <button
            key={o.key}
            type="button"
            disabled={submitting !== null || !canAfford || !noteOk}
            onClick={() => submit(o.key)}
            className="text-xs font-bold py-2.5 rounded-lg bg-surface border border-gold text-gold disabled:opacity-50 truncate"
          >
            {submitting === o.key ? "…" : o.label}
          </button>
        ))}
      </div>
      {!noteOk && (
        <p className="text-[11px] text-ink-faint">
          根拠を{NOTE_MIN}文字以上書くと、結果を報告できます。
        </p>
      )}
      {error && <p className="text-[11px] text-neg">{error}</p>}
    </section>
  );
}
