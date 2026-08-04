import type { MarketPool, OutcomeOption } from "./types";

export interface PoolOptionBreakdown {
  key: string;
  label: string;
  amount: number;
  pct: number;
}

export interface PoolBreakdown {
  total: number;
  options: PoolOptionBreakdown[];
}

// Generic over however many outcome_options a market has — 2 for a
// yes/no question, 3 for a soccer result, up to 8 for a multi-choice
// market. Always returns one entry per option, in the market's own
// option order, even when nobody has bet on it yet.
export function summarizePools(pools: MarketPool[], outcomeOptions: OutcomeOption[]): PoolBreakdown {
  const amountByKey = new Map<string, number>();
  for (const p of pools) {
    amountByKey.set(p.outcome, Number(p.pool_amount));
  }

  const total = outcomeOptions.reduce((sum, o) => sum + (amountByKey.get(o.key) ?? 0), 0);

  const options = outcomeOptions.map((o) => {
    const amount = amountByKey.get(o.key) ?? 0;
    return {
      key: o.key,
      label: o.label,
      amount,
      pct: total > 0 ? Math.round((amount / total) * 100) : 0,
    };
  });

  return { total, options };
}

// Estimated parimutuel payout multiplier for staking `amount` on `key`,
// mirroring settle_market's payout math: full stake back, plus a share
// of the *other* options' combined pool after rake. Betting where
// nobody has bet against you breaks even (multiplier 1) instead of
// losing money to the rake.
export function estimateMultiplier(pool: PoolBreakdown, key: string, amount: number, rakeBps: number): number | null {
  const current = pool.options.find((o) => o.key === key)?.amount ?? 0;
  const winningAfter = current + amount;
  if (winningAfter <= 0) return null;
  const losingAfter = pool.total + amount - winningAfter;
  const distributableProfit = losingAfter * (1 - rakeBps / 10000);
  return 1 + distributableProfit / winningAfter;
}
