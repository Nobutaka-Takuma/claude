import type { PoolBreakdown } from "@/lib/pool";

// Cycles through the theme's accent colors for however many outcome
// options a market has (2 for yes/no, 3 for a soccer result, up to 8 for
// a multi-choice market) instead of assuming a fixed home/draw/away set.
const PALETTE = [
  "var(--color-accent)",
  "var(--color-gold)",
  "var(--color-draw)",
  "var(--color-neg)",
  "color-mix(in srgb, var(--color-accent) 50%, var(--color-draw))",
  "color-mix(in srgb, var(--color-gold) 55%, var(--color-neg))",
  "color-mix(in srgb, var(--color-accent) 50%, var(--color-gold))",
  "color-mix(in srgb, var(--color-draw) 50%, var(--color-neg))",
];

export default function OutcomeBar({ pool }: { pool: PoolBreakdown }) {
  if (pool.total === 0) {
    return <p className="text-xs text-ink-faint">まだ予想がありません</p>;
  }

  return (
    <div className="space-y-1">
      <div className="flex h-4 rounded-md overflow-hidden bg-surface-2">
        {pool.options.map((o, i) => (
          <div key={o.key} style={{ width: `${o.pct}%`, backgroundColor: PALETTE[i % PALETTE.length] }} />
        ))}
      </div>
      <div className="flex flex-wrap justify-between gap-x-3 text-[11px] font-mono-num text-ink-faint">
        {pool.options.map((o) => (
          <span key={o.key}>
            {o.label} {o.pct}%
          </span>
        ))}
      </div>
    </div>
  );
}
