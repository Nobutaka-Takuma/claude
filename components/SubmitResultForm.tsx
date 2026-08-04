"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { OutcomeOption } from "@/lib/types";

const WINDOW_OPTIONS = [
  { minutes: 60 * 24, label: "24時間（本番想定）" },
  { minutes: 2, label: "2分（デモ確認用）" },
];

export default function SubmitResultForm({
  marketId,
  outcomeOptions,
}: {
  marketId: string;
  outcomeOptions: OutcomeOption[];
}) {
  const router = useRouter();
  const [windowMinutes, setWindowMinutes] = useState(WINDOW_OPTIONS[0].minutes);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(outcome: string) {
    setSubmitting(outcome);
    setError(null);
    const res = await fetch(`/api/markets/${marketId}/submit-result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome, disputeWindowMinutes: windowMinutes }),
    });
    if (!res.ok) {
      setError("一次判定の提出に失敗しました");
      setSubmitting(null);
      return;
    }
    setSubmitting(null);
    router.refresh();
  }

  return (
    <div className="space-y-2 rounded-lg border border-gold/50 bg-gold-soft p-3">
      <p className="text-xs font-bold text-gold">
        管理者操作: 一次判定を提出（Optimistic Oracle）
      </p>
      <p className="text-[11px] text-ink-muted">
        ここでは精算せず、異議申し立て期間を開始します。期間内に異議がなければ自動で確定・精算され、異議が出た場合はDAO投票で最終決定します。
      </p>

      <label className="block space-y-1">
        <span className="text-[11px] text-ink-muted">異議申し立て期間</span>
        <select
          value={windowMinutes}
          onChange={(e) => setWindowMinutes(Number(e.target.value))}
          className="w-full text-xs rounded-lg border border-line-strong bg-surface px-2 py-1.5"
        >
          {WINDOW_OPTIONS.map((o) => (
            <option key={o.minutes} value={o.minutes}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-2">
        {outcomeOptions.map((o) => (
          <button
            key={o.key}
            type="button"
            disabled={submitting !== null}
            onClick={() => submit(o.key)}
            className="text-xs font-bold py-2 rounded-lg bg-white border border-gold text-gold disabled:opacity-50 truncate"
          >
            {submitting === o.key ? "…" : o.label}
          </button>
        ))}
      </div>
      {error && <p className="text-[11px] text-neg">{error}</p>}
    </div>
  );
}
