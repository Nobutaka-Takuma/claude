import Link from "next/link";
import { formatPoints, formatRelativeToNow } from "@/lib/format";
import { summarizePools } from "@/lib/pool";
import { marketHeading, outcomeLabel } from "@/lib/outcome";
import type { Market, MarketPool } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";

const CATEGORY_ICON: Record<string, string> = {
  soccer: "⚽",
  finance: "💹",
  economy: "💹",
  politics: "🏛",
  tech: "💻",
  general: "❓",
};

// Polymarket-style row: the question leads, the leading outcome's implied
// probability is the single biggest number on the card, and volume /
// deadline sit underneath as small monospaced metadata.
export default function MarketCard({ market, pools }: { market: Market; pools: MarketPool[] }) {
  const pool = summarizePools(pools, market.outcome_options);
  const leading = [...pool.options].sort((a, b) => b.amount - a.amount)[0];
  const heading = marketHeading(market);
  const icon = CATEGORY_ICON[market.category] ?? "❓";

  return (
    <Link
      href={`/markets/${market.id}`}
      className="block rounded-xl border border-line bg-surface p-4 hover:border-line-strong"
    >
      <div className="flex items-start gap-3">
        <span className="text-lg leading-none mt-0.5">{icon}</span>

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-bold leading-snug">{heading}</h3>
            <StatusBadge status={market.status} />
          </div>

          {market.status === "resolved" ? (
            <p className="text-xs font-bold text-accent-ink">
              結果: {outcomeLabel(market.outcome_options, market.outcome)}
            </p>
          ) : pool.total === 0 ? (
            <p className="text-[11px] text-ink-faint">まだベットがありません — 最初の予想を入れてみましょう</p>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-baseline gap-2">
                <span className="font-mono-num text-2xl font-extrabold leading-none text-accent-ink">
                  {leading?.pct ?? 0}%
                </span>
                <span className="text-xs font-semibold text-ink-muted truncate">{leading?.label}</span>
              </div>
              <div className="flex h-1.5 rounded-full overflow-hidden bg-surface-2">
                <div className="bg-accent" style={{ width: `${leading?.pct ?? 0}%` }} />
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 text-[10px] font-mono-num text-ink-faint">
            <span>出来高 {formatPoints(pool.total)}</span>
            {market.status !== "resolved" && <span>締切 {formatRelativeToNow(market.kickoff_time)}</span>}
            {market.creator_fee_bps > 0 && <span className="text-gold">作成者報酬あり</span>}
          </div>
        </div>
      </div>
    </Link>
  );
}
