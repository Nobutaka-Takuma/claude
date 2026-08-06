"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { PoolBreakdown } from "@/lib/pool";
import { estimateMultiplier } from "@/lib/pool";
import type { OutcomeOption } from "@/lib/types";
import { apiErrorMessage, isAuthError, readErrorBody } from "@/lib/errorMessages";

const STAKE_PRESETS = [10, 50, 100, 500];

export default function BetForm({
  marketId,
  pool,
  outcomeOptions,
  rakeBps,
  seedPool = 0,
  maxAmount,
  compact = false,
}: {
  marketId: string;
  pool: PoolBreakdown;
  outcomeOptions: OutcomeOption[];
  rakeBps: number;
  seedPool?: number;
  maxAmount: number;
  // Skips the amount input and multiplier caption, showing just the
  // outcome buttons (each with its own odds) — used inline in the news
  // feed where a default stake is placed with one tap and the full
  // control set would be too heavy for a feed card.
  compact?: boolean;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState(outcomeOptions[0]?.key ?? "");
  const [amount, setAmount] = useState(100);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Mirrors settle_market's payout math: your stake always comes back in
  // full, plus a share of the losing pool's profit after rake — rake is
  // never taken out of your own stake, so betting alone (nobody on the
  // other side) breaks even instead of losing money to the fee.
  const estimatedMultiplier = useMemo(
    () => estimateMultiplier(pool, outcome, amount, rakeBps, seedPool),
    [pool, outcome, amount, rakeBps, seedPool]
  );

  // Always quotes the multiplier for the stake actually about to be
  // placed. Quoting it for a nominal 1pt instead would advertise wild
  // numbers (x91 on an untouched side) that collapse the moment the real
  // stake lands and moves the pool.
  const multiplierFor = (key: string, stake: number) =>
    estimateMultiplier(pool, key, Math.max(stake, 1), rakeBps, seedPool);

  async function placeBet(chosenOutcome: string, chosenAmount: number) {
    setSubmitting(chosenOutcome);
    setError(null);

    const res = await fetch(`/api/markets/${marketId}/bet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome: chosenOutcome, amount: chosenAmount }),
    });

    if (!res.ok) {
      const body = await readErrorBody(res);
      if (isAuthError(body.error)) {
        router.push("/login");
        return;
      }
      setError(apiErrorMessage(body.error, "ベットに失敗しました", body.detail));
      setSubmitting(null);
      return;
    }

    setSubmitting(null);
    router.refresh();
  }

  if (compact) {
    const affordable = STAKE_PRESETS.filter((p) => p <= maxAmount);
    const stake = Math.min(amount, maxAmount);
    const canBet = stake > 0 && stake <= maxAmount;

    return (
      <div className="space-y-2">
        <div className="flex gap-2">
          {outcomeOptions.map((o) => {
            const share = pool.options.find((p) => p.key === o.key);
            const mult = multiplierFor(o.key, stake);
            return (
              <button
                key={o.key}
                type="button"
                disabled={submitting !== null || !canBet}
                onClick={() => placeBet(o.key, stake)}
                className="flex-1 rounded-lg border border-line-strong py-2 px-2 text-center hover:border-accent hover:bg-accent-soft disabled:opacity-40"
              >
                {/* Pool share is the implied probability in a parimutuel
                    market, so it doubles as Polymarket's "chance" number. */}
                <span className="block font-mono-num text-lg font-extrabold leading-tight text-accent-ink">
                  {submitting === o.key ? "…" : pool.total > 0 ? `${share?.pct ?? 0}%` : "—"}
                </span>
                <span className="block text-[11px] font-bold truncate">{o.label}</span>
                <span className="block text-[10px] font-mono-num text-ink-faint">
                  {mult ? `払戻 x${mult.toFixed(2)}` : "-"}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-ink-faint">賭ける額</span>
          {affordable.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setAmount(p)}
              className={`font-mono-num text-[10px] font-bold rounded-full px-2 py-0.5 border ${
                stake === p ? "bg-accent text-white border-accent" : "border-line-strong text-ink-muted"
              }`}
            >
              {p}
            </button>
          ))}
          <span className="text-[10px] text-ink-faint ml-auto">
            保有 {maxAmount.toLocaleString("ja-JP")}pt
          </span>
        </div>

        {!canBet && <p className="text-[10px] text-neg">ポイント残高が不足しています</p>}
        {error && <p className="text-[11px] text-neg">{error}</p>}
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        placeBet(outcome, amount);
      }}
      className="space-y-3"
    >
      <div className="flex flex-wrap gap-2">
        {outcomeOptions.map((o) => {
          const mult = multiplierFor(o.key, amount);
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => setOutcome(o.key)}
              className={`flex-1 min-w-[5.5rem] text-xs font-bold py-2 px-2 rounded-lg border truncate ${
                outcome === o.key
                  ? "bg-accent text-white border-accent"
                  : "border-line-strong text-ink-muted"
              }`}
            >
              <span className="block">{o.label}</span>
              <span className="block text-[10px] font-mono-num font-normal opacity-80">
                {mult ? `x${mult.toFixed(2)}` : "-"}
              </span>
            </button>
          );
        })}
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
        disabled={submitting !== null || amount <= 0 || amount > maxAmount || !outcome}
        className="w-full rounded-lg bg-gold text-white font-bold text-sm py-2.5 disabled:opacity-40"
      >
        {submitting ? "送信中…" : "ベットを確定する"}
      </button>
    </form>
  );
}
