"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AdminResolveForm({
  marketId,
  homeLabel,
  awayLabel,
}: {
  marketId: string;
  homeLabel: string;
  awayLabel: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resolve(outcome: "home" | "draw" | "away" | "void") {
    if (!confirm(`この結果で確定し、精算します: ${outcome}`)) return;
    setSubmitting(outcome);
    setError(null);
    const res = await fetch(`/api/markets/${marketId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome }),
    });
    if (!res.ok) {
      setError("精算に失敗しました");
      setSubmitting(null);
      return;
    }
    setSubmitting(null);
    router.refresh();
  }

  return (
    <div className="space-y-2 rounded-lg border border-gold/50 bg-gold-soft p-3">
      <p className="text-xs font-bold text-gold">管理者操作: 判定を確定して精算</p>
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["home", `${homeLabel} 勝ち`],
            ["draw", "引き分け"],
            ["away", `${awayLabel} 勝ち`],
            ["void", "中止（全額返金）"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            disabled={submitting !== null}
            onClick={() => resolve(key)}
            className="text-xs font-bold py-2 rounded-lg bg-white border border-gold text-gold disabled:opacity-50"
          >
            {submitting === key ? "処理中…" : label}
          </button>
        ))}
      </div>
      {error && <p className="text-[11px] text-neg">{error}</p>}
    </div>
  );
}
