import type { MarketPool } from "./types";

export interface PoolBreakdown {
  home: number;
  draw: number;
  away: number;
  total: number;
  homePct: number;
  drawPct: number;
  awayPct: number;
}

export function summarizePools(pools: MarketPool[]): PoolBreakdown {
  const amounts = { home: 0, draw: 0, away: 0 };
  for (const p of pools) {
    if (p.outcome === "home" || p.outcome === "draw" || p.outcome === "away") {
      amounts[p.outcome] = Number(p.pool_amount);
    }
  }
  const total = amounts.home + amounts.draw + amounts.away;
  if (total === 0) {
    return { ...amounts, total: 0, homePct: 0, drawPct: 0, awayPct: 0 };
  }
  return {
    ...amounts,
    total,
    homePct: Math.round((amounts.home / total) * 100),
    drawPct: Math.round((amounts.draw / total) * 100),
    awayPct: Math.round((amounts.away / total) * 100),
  };
}
