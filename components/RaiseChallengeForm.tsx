"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiErrorMessage, readErrorBody } from "@/lib/errorMessages";

export default function RaiseChallengeForm({
  marketId,
  bond,
  votingHours,
  awardPct,
  balance,
}: {
  marketId: string;
  bond: number;
  votingHours: number;
  awardPct: number;
  balance: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={balance < bond}
        className="w-full text-xs font-semibold text-neg border border-neg rounded-lg px-3 py-2 disabled:opacity-50"
      >
        異議を申し立てる（保証金 {bond}pt）
      </button>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/markets/${marketId}/challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, evidenceUrl }),
    });
    if (!res.ok) {
      const body = await readErrorBody(res);
      setError(apiErrorMessage(body.error, "異議を申し立てられませんでした。", body.detail));
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-2 border border-neg/40 rounded-lg p-3">
      <p className="text-[11px] text-ink-muted">
        保証金 <span className="font-mono-num font-bold">{bond}pt</span> を預けて異議を申し立てます。
        {votingHours}時間のDAO投票で決着し、あなたの主張が支持されれば保証金は返却され、さらに提案者の
        保証金の{awardPct}%を受け取れます。支持されなかった場合、あなたの保証金は没収されます。
      </p>
      <label className="block space-y-1">
        <span className="text-xs text-ink-muted">異議の理由</span>
        <textarea
          required
          minLength={5}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm"
          rows={3}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-ink-muted">証拠URL（任意）</span>
        <input
          type="url"
          value={evidenceUrl}
          onChange={(e) => setEvidenceUrl(e.target.value)}
          className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm"
          placeholder="https://"
        />
      </label>
      {error && <p className="text-xs text-neg">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full text-xs font-bold text-white bg-neg rounded-lg px-3 py-2 disabled:opacity-50"
      >
        {submitting ? "送信中…" : "異議を送信してDAO投票を開始"}
      </button>
    </form>
  );
}
