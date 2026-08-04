"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { PoolBreakdown } from "@/lib/pool";

const ERROR_MESSAGES: Record<string, string> = {
  insufficient_balance: "ポイント残高が不足しています",
  market_not_open: "このマーケットは受付を終了しています",
  invalid_amount: "金額を正しく入力してください",
};

export default function BetForm({
  marketId,
  pool,
  homeLabel,
  awayLabel,
  rakeBps,
  maxAmount,
}: {
  marketId: string;
  pool: PoolBreakdown;
  homeLabel: string;
  awayLabel: string;
  rakeBps: number;
  maxAmount: number;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<"home" | "draw" | "away">("home");
  const [amount, setAmount] = useState(100);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const estimatedMultiplier = useMemo(() => {
    const current = { home: pool.home, draw: pool.draw, away: pool.away }[outcome];
    const totalAfter = pool.total + amount;
    const winningAfter = current + amount;
    const distributable = totalAfter * (1 - rakeBps / 10000);
    if (winningAfter === 0) return null;
    return distributable / winningAfter;
  }, [pool, outcome, amount, rakeBps]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/markets/${marketId}/bet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome, amount }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "unknown" }));
      setError(ERROR_MESSAGES[body.error] ?? "ベットに失敗しました");
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
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
            onClick={() => setOutcome(key)}
            className={`text-xs font-bold py-2 rounded-lg border truncate ${
              outcome === key
                ? "bg-accent text-white border-accent"
                : "border-line-strong text-ink-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <label className="block space-y-1">
        <span className="text-xs text-ink-muted">金額（保有: {maxAmount.toLocaleString("ja-JP")}pt）</span>
        <input
          type="number"
          min={1}
          max={maxAmount}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm font-mono-num"
        />
      </label>

      <p className="text-[11px] text-ink-faint">
        想定配当倍率（現時点の按分想定）: 約{" "}
        <span className="font-mono-num font-semibold text-ink">
          x{estimatedMultiplier ? estimatedMultiplier.toFixed(2) : "-"}
        </span>
      </p>

      {error && <p className="text-xs text-neg">{error}</p>}

      <button
        type="submit"
        disabled={submitting || amount <= 0 || amount > maxAmount}
        className="w-full rounded-lg bg-gold text-white font-bold text-sm py-2.5 disabled:opacity-40"
      >
        {submitting ? "送信中…" : "ベットを確定する"}
      </button>
    </form>
  );
}
