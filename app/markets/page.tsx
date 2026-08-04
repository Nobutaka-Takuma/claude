import Link from "next/link";
import { listMarkets, getMarketPools } from "@/lib/data";
import { formatRelativeToNow } from "@/lib/format";
import { summarizePools } from "@/lib/pool";
import OutcomeBar from "@/components/OutcomeBar";
import StatusBadge from "@/components/StatusBadge";
import type { MarketStatus } from "@/lib/types";

const TABS: { key: string; label: string; statuses: MarketStatus[] }[] = [
  { key: "open", label: "受付中", statuses: ["open"] },
  { key: "closing", label: "終了間近・判定中", statuses: ["locked", "pending_resolution", "disputed"] },
  { key: "resolved", label: "終了済", statuses: ["resolved", "cancelled"] },
];

export default async function MarketsPage({ searchParams }: PageProps<"/markets">) {
  const params = await searchParams;
  const activeTab = typeof params.tab === "string" ? params.tab : "open";
  const tab = TABS.find((t) => t.key === activeTab) ?? TABS[0];

  const allMarkets = await listMarkets();
  const markets = allMarkets.filter((m) => tab.statuses.includes(m.status));
  const pools = await Promise.all(markets.map((m) => getMarketPools(m.id)));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-extrabold">マーケット一覧</h1>
        <Link href="/markets/propose" className="text-xs font-bold rounded-full bg-gold-soft text-gold px-3 py-1.5">
          + お題を提案
        </Link>
      </div>

      <div className="flex gap-2 text-xs font-semibold">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/markets?tab=${t.key}`}
            className={`px-3 py-1.5 rounded-full ${
              t.key === tab.key ? "bg-accent text-white" : "border border-line-strong text-ink-muted"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {markets.length === 0 ? (
        <p className="text-xs text-ink-faint rounded-xl border border-line bg-surface p-4">
          該当するマーケットはありません。
        </p>
      ) : (
        <ul className="space-y-3">
          {markets.map((market, i) => (
            <li key={market.id}>
              <Link
                href={`/markets/${market.id}`}
                className="block rounded-xl border border-line bg-surface p-4 hover:border-line-strong space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-sm">
                    ⚽ {market.home_team} vs {market.away_team}
                  </span>
                  <StatusBadge status={market.status} />
                </div>
                <p className="text-xs text-ink-faint">
                  {market.status === "resolved"
                    ? `結果: ${outcomeLabel(market)}`
                    : `キックオフ ${formatRelativeToNow(market.kickoff_time)}`}
                </p>
                <OutcomeBar pool={summarizePools(pools[i])} homeLabel={market.home_team} awayLabel={market.away_team} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function outcomeLabel(market: { outcome: string | null; home_team: string; away_team: string }) {
  if (market.outcome === "home") return `${market.home_team} 勝ち`;
  if (market.outcome === "away") return `${market.away_team} 勝ち`;
  if (market.outcome === "draw") return "引き分け";
  return "中止・返金";
}
