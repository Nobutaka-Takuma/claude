import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import {
  getTreasury,
  listMarkets,
  getActiveTasks,
  getUserVerifiedCompletionCounts,
  getMarketPools,
  getNewsFeed,
} from "@/lib/data";
import { formatPoints } from "@/lib/format";
import { summarizePools } from "@/lib/pool";
import { MARKET_CREATION_COST, MARKET_CREATOR_FEE_BPS } from "@/lib/config";
import MarketCard from "@/components/MarketCard";

export default async function HomePage() {
  const profile = await getCurrentProfile();
  const [treasury, openMarkets, tasks, articles] = await Promise.all([
    getTreasury(),
    listMarkets("open"),
    getActiveTasks(),
    getNewsFeed(),
  ]);

  // Lead with whatever people are actually betting on, not just whatever
  // closes soonest — an empty market is a poor first impression.
  const marketPools = await Promise.all(openMarkets.map((m) => getMarketPools(m.id)));
  const ranked = openMarkets
    .map((m, i) => ({
      market: m,
      pools: marketPools[i],
      volume: summarizePools(marketPools[i], m.outcome_options).total,
    }))
    .sort(
      (a, b) =>
        b.volume - a.volume ||
        new Date(a.market.kickoff_time).getTime() - new Date(b.market.kickoff_time).getTime()
    )
    .slice(0, 4);

  const completionCounts = profile ? await getUserVerifiedCompletionCounts(profile.id) : {};
  const openTasks = tasks.filter((t) => {
    const done = completionCounts[t.id] ?? 0;
    return t.max_completions_per_user === null || done < t.max_completions_per_user;
  });

  const latestArticle = articles[0];
  const creatorFeePct = MARKET_CREATOR_FEE_BPS() / 100;

  return (
    <div className="space-y-6">
      {!profile && (
        <div className="rounded-xl border border-line bg-surface p-5">
          <h1 className="text-lg font-extrabold leading-snug">
            ニュースを読む。未来を予想する。当てて増やす。
          </h1>
          <p className="text-sm text-ink-muted mt-2">
            広告視聴やアンケートで貯めたポイントで予想に参加。気になる論点は自分でマーケットを作れて、
            盛り上がればテラ銭の{creatorFeePct}%が報酬として入ります。
          </p>
          <p className="text-xs text-accent-ink font-semibold mt-2">
            いま登録すると {formatPoints(1000)} からスタートできます。
          </p>
          <div className="flex gap-2 mt-4">
            <Link href="/signup" className="rounded-lg bg-accent text-white text-sm font-semibold px-4 py-2">
              無料ではじめる
            </Link>
            <Link href="/news" className="rounded-lg border border-line-strong text-sm font-semibold px-4 py-2">
              ニュースを見る
            </Link>
          </div>
        </div>
      )}

      {latestArticle && (
        <Link
          href="/news"
          className="block rounded-xl border border-line bg-surface-2 p-4 hover:border-line-strong"
        >
          <span className="text-[10px] font-bold text-ink-faint">📰 最新ニュースから予測する</span>
          <p className="text-sm font-bold mt-1 leading-snug">{latestArticle.title}</p>
          <span className="text-xs text-accent-ink font-semibold mt-1 inline-block">
            {latestArticle.markets.length > 0
              ? `${latestArticle.markets.length}件の予想マーケット >`
              : `このニュースでマーケットを作る（${MARKET_CREATION_COST()}pt） >`}
          </span>
        </Link>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">🔥 盛り上がっているマーケット</h2>
          <Link href="/markets" className="text-xs text-accent-ink font-semibold">
            すべて見る &gt;
          </Link>
        </div>

        {ranked.length === 0 ? (
          <p className="text-xs text-ink-faint rounded-xl border border-line bg-surface p-4">
            現在受付中のマーケットはありません。
          </p>
        ) : (
          <ul className="space-y-3">
            {ranked.map(({ market, pools }) => (
              <li key={market.id}>
                <MarketCard market={market} pools={pools} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {profile && openTasks.length > 0 && (
        <section className="rounded-xl border border-line bg-surface p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold">ポイントを貯める</h2>
            <Link href="/tasks" className="text-xs text-accent-ink font-semibold">
              タスクセンターへ &gt;
            </Link>
          </div>
          <ul className="space-y-2">
            {openTasks.slice(0, 3).map((task) => (
              <li key={task.id} className="flex items-center justify-between text-sm">
                <span>
                  {task.type === "ad_view" ? "🎬" : "📋"} {task.title}
                </span>
                <span className="font-mono-num text-accent-ink font-semibold">
                  +{formatPoints(task.reward_points)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link
        href="/treasury"
        className="flex items-center justify-between rounded-xl border border-line bg-surface p-4 hover:border-line-strong"
      >
        <span className="text-xs font-bold text-ink-muted">コミュニティ金庫(Treasury)</span>
        <span className="font-mono-num text-lg font-extrabold text-accent-ink">
          {formatPoints(treasury.balance)}
        </span>
      </Link>
    </div>
  );
}
