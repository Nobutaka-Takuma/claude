import type { PoolBreakdown } from "@/lib/pool";

export default function OutcomeBar({
  pool,
  homeLabel,
  awayLabel,
}: {
  pool: PoolBreakdown;
  homeLabel: string;
  awayLabel: string;
}) {
  if (pool.total === 0) {
    return <p className="text-xs text-ink-faint">まだベットがありません</p>;
  }

  return (
    <div className="space-y-1">
      <div className="flex h-4 rounded-md overflow-hidden bg-surface-2">
        <div className="bg-accent" style={{ width: `${pool.homePct}%` }} />
        <div className="bg-draw" style={{ width: `${pool.drawPct}%` }} />
        <div className="bg-gold" style={{ width: `${pool.awayPct}%` }} />
      </div>
      <div className="flex justify-between text-[11px] font-mono-num text-ink-faint">
        <span>{homeLabel} {pool.homePct}%</span>
        <span>引分 {pool.drawPct}%</span>
        <span>{awayLabel} {pool.awayPct}%</span>
      </div>
    </div>
  );
}
