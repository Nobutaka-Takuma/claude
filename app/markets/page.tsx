import Link from "next/link";
import { listMarkets, getMarketPools } from "@/lib/data";
import MarketCard from "@/components/MarketCard";
import type { MarketStatus } from "@/lib/types";

const TABS: { key: string; label: string; statuses: MarketStatus[] }[] = [
  { key: "open", label: "受付中", statuses: ["open"] },
  { key: "closing", label: "判定中", statuses: ["locked", "pending_resolution", "disputed"] },
  { key: "resolved", label: "終了済", statuses: ["resolved", "cancelled"] },
];

const CATEGORY_LABELS: Record<string, string> = {
  soccer: "⚽ サッカー",
  finance: "💹 金融",
  economy: "💹 経済",
  politics: "🏛 政治",
  tech: "💻 テック",
  general: "❓ その他",
};

export default async function MarketsPage({ searchParams }: PageProps<"/markets">) {
  const params = await searchParams;
  const activeTab = typeof params.tab === "string" ? params.tab : "open";
  const activeCategory = typeof params.category === "string" ? params.category : null;
  const tab = TABS.find((t) => t.key === activeTab) ?? TABS[0];

  const allMarkets = await listMarkets();
  const inTab = allMarkets.filter((m) => tab.statuses.includes(m.status));

  // Category chips are derived from what's actually in this tab, so users
  // never see a filter that would return nothing.
  const categories = [...new Set(inTab.map((m) => m.category))].sort();
  const markets = activeCategory ? inTab.filter((m) => m.category === activeCategory) : inTab;
  const pools = await Promise.all(markets.map((m) => getMarketPools(m.id)));

  const withCategory = (category: string | null) =>
    `/markets?tab=${tab.key}${category ? `&category=${encodeURIComponent(category)}` : ""}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-extrabold">マーケット</h1>
        <Link
          href="/markets/propose"
          className="text-xs font-bold rounded-full bg-gold text-white px-3 py-1.5"
        >
          ＋ 作る
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

      {categories.length > 1 && (
        <div className="flex gap-1.5 flex-wrap text-[11px] font-semibold">
          <Link
            href={withCategory(null)}
            className={`px-2.5 py-1 rounded-full ${
              !activeCategory ? "bg-ink text-bg" : "border border-line text-ink-faint"
            }`}
          >
            すべて
          </Link>
          {categories.map((c) => (
            <Link
              key={c}
              href={withCategory(c)}
              className={`px-2.5 py-1 rounded-full ${
                activeCategory === c ? "bg-ink text-bg" : "border border-line text-ink-faint"
              }`}
            >
              {CATEGORY_LABELS[c] ?? c}
            </Link>
          ))}
        </div>
      )}

      {markets.length === 0 ? (
        <p className="text-xs text-ink-faint rounded-xl border border-line bg-surface p-4">
          該当するマーケットはありません。
        </p>
      ) : (
        <ul className="space-y-3">
          {markets.map((market, i) => (
            <li key={market.id}>
              <MarketCard market={market} pools={pools[i]} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
