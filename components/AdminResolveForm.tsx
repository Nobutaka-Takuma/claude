"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiErrorMessage } from "@/lib/errorMessages";
import type { OutcomeOption } from "@/lib/types";

export default function AdminResolveForm({
  marketId,
  outcomeOptions,
}: {
  marketId: string;
  outcomeOptions: OutcomeOption[];
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resolve(outcome: string) {
    if (!confirm(`異議申し立て期間・DAO投票をスキップしてこの結果で即時確定します: ${outcome}\nよろしいですか？`)) return;
    setSubmitting(outcome);
    setError(null);
    const res = await fetch(`/api/markets/${marketId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "unknown" }));
      setError(apiErrorMessage(body.error, "精算に失敗しました。", body.detail));
      setSubmitting(null);
      return;
    }
    setSubmitting(null);
    router.refresh();
  }

  const options = [...outcomeOptions.map((o) => ({ key: o.key, label: o.label })), { key: "void", label: "中止（全額返金）" }];

  return (
    <div className="space-y-2 rounded-lg border border-neg/50 p-3">
      <p className="text-xs font-bold text-neg">管理者操作（緊急）: オラクルをスキップして即時確定</p>
      <p className="text-[11px] text-ink-faint">
        通常は上の「一次判定を提出」を使ってください。これは異議申し立て期間・DAO投票を飛ばして強制的に精算する緊急用の操作です。
      </p>
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            disabled={submitting !== null}
            onClick={() => resolve(o.key)}
            className="text-xs font-bold py-2 rounded-lg bg-white border border-neg text-neg disabled:opacity-50 truncate"
          >
            {submitting === o.key ? "処理中…" : o.label}
          </button>
        ))}
      </div>
      {error && <p className="text-[11px] text-neg">{error}</p>}
    </div>
  );
}
