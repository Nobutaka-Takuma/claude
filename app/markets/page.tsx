import Link from "next/link";
import { searchMarkets, getMarketPools, getLeagueFacets } from "@/lib/data";
import { CATEGORIES, categoryLabel } from "@/lib/categories";
import MarketCard from "@/components/MarketCard";
import MarketSearchBox from "@/components/MarketSearchBox";
import type { MarketStatus } from "@/lib/types";

const TABS: { key: string; label: string; statuses: MarketStatus[] }[] = [
  { key: "open", label: "受付中", statuses: ["open"] },
  { key: "closing", label: "判定中", statuses: ["locked", "pending_resolution", "disputed"] },
  { key: "resolved", label: "終了済", statuses: ["resolved", "cancelled"] },
];

const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : null);

export default async function MarketsPage({ searchParams }: PageProps<"/markets">) {
  const params = await searchParams;
  const tab = TABS.find((t) => t.key === str(params.tab)) ?? TABS[0];
  const category = str(params.category);
  const league = str(params.league);
  const matchweekRaw = str(params.matchweek);
  const matchweek = matchweekRaw ? Number(matchweekRaw) : null;
  const q = str(params.q);

  const [markets, leagueFacets] = await Promise.all([
    searchMarkets({ statuses: tab.statuses, category, league, matchweek, q }),
    getLeagueFacets(tab.statuses),
  ]);
  const pools = await Promise.all(markets.map((m) => getMarketPools(m.id)));

  const hasFilters = !!(category || league || matchweek || q);

  // Preserve the other filters when toggling one of them.
  const linkWith = (overrides: Record<string, string | number | null>) => {
    const sp = new URLSearchParams();
    sp.set("tab", tab.key);
    const merged = { category, league, matchweek, q, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v !== null && v !== undefined && v !== "") sp.set(k, String(v));
    }
    return `/markets?${sp}`;
  };

  const leagues = [...new Set(leagueFacets.map((f) => f.league))];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-extrabold">マーケット</h1>
        <Link href="/markets/propose" className="text-xs font-bold rounded-full bg-gold text-white px-3 py-1.5">
          ＋ 作る
        </Link>
      </div>

      <MarketSearchBox defaultValue={q ?? ""} hiddenParams={{ tab: tab.key, category, league, matchweek }} />

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

      <div className="flex gap-1.5 flex-wrap text-[11px] font-semibold">
        <Link
          href={linkWith({ category: null, league: null, matchweek: null })}
          className={`px-2.5 py-1 rounded-full ${
            !category ? "bg-ink text-bg" : "border border-line text-ink-faint"
          }`}
        >
          すべて
        </Link>
        {CATEGORIES.map((c) => (
          <Link
            key={c.key}
            href={linkWith({ category: c.key, league: null, matchweek: null })}
            className={`px-2.5 py-1 rounded-full ${
              category === c.key ? "bg-ink text-bg" : "border border-line text-ink-faint"
            }`}
          >
            {c.icon} {c.label}
          </Link>
        ))}
      </div>

      {leagues.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex gap-1.5 flex-wrap text-[11px]">
            {leagues.map((l) => (
              <Link
                key={l}
                href={linkWith({ league: league === l ? null : l, matchweek: null })}
                className={`px-2.5 py-1 rounded-full font-semibold ${
                  league === l ? "bg-accent text-white" : "border border-line-strong text-ink-muted"
                }`}
              >
                {l}
              </Link>
            ))}
          </div>

          {league && (
            <div className="flex gap-1.5 flex-wrap text-[11px] font-mono-num">
              {leagueFacets
                .filter((f) => f.league === league && f.matchweek !== null)
                .map((f) => (
                  <Link
                    key={f.matchweek}
                    href={linkWith({ matchweek: matchweek === f.matchweek ? null : f.matchweek })}
                    className={`px-2 py-0.5 rounded-full ${
                      matchweek === f.matchweek
                        ? "bg-accent text-white"
                        : "border border-line text-ink-faint"
                    }`}
                  >
                    第{f.matchweek}節（{f.count}）
                  </Link>
                ))}
            </div>
          )}
        </div>
      )}

      {hasFilters && (
        <div className="flex items-center gap-2 text-[11px] text-ink-faint">
          <span>
            {markets.length}件
            {q && ` ・「${q}」`}
            {category && ` ・${categoryLabel(category)}`}
            {league && ` ・${league}`}
            {matchweek && ` 第${matchweek}節`}
          </span>
          <Link href={`/markets?tab=${tab.key}`} className="text-accent-ink font-semibold">
            条件をクリア
          </Link>
        </div>
      )}

      {markets.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface p-4 space-y-2">
          <p className="text-xs text-ink-faint">該当するマーケットはありません。</p>
          <Link href="/markets/propose" className="inline-block text-xs text-accent-ink font-semibold">
            探しているお題が無ければ、自分で作れます &gt;
          </Link>
        </div>
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
