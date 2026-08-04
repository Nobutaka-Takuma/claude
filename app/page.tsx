import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { getTreasury, listMarkets, getActiveTasks, getUserVerifiedCompletionCounts, getMarketPools } from "@/lib/data";
import { formatPoints, formatRelativeToNow } from "@/lib/format";
import { summarizePools } from "@/lib/pool";
import { marketHeading } from "@/lib/outcome";
import OutcomeBar from "@/components/OutcomeBar";
import StatusBadge from "@/components/StatusBadge";

export default async function HomePage() {
  const profile = await getCurrentProfile();
  const [treasury, allMarkets, tasks] = await Promise.all([
    getTreasury(),
    listMarkets("open"),
    getActiveTasks(),
  ]);

  const featuredMarkets = allMarkets.slice(0, 3);
  const pools = await Promise.all(featuredMarkets.map((m) => getMarketPools(m.id)));

  const completionCounts = profile ? await getUserVerifiedCompletionCounts(profile.id) : {};
  const openTasks = tasks.filter((t) => {
    const done = completionCounts[t.id] ?? 0;
    return t.max_completions_per_user === null || done < t.max_completions_per_user;
  });

  return (
    <div className="space-y-6">
      {!profile && (
        <div className="rounded-xl border border-line bg-surface p-5">
          <h1 className="text-lg font-extrabold">労働が金庫を育て、金庫が予測市場を回す。</h1>
          <p className="text-sm text-ink-muted mt-1">
            広告視聴やアンケートで貯めたポイントで、サッカーの試合結果を予測してみんなで山分けしよう。
          </p>
          <div className="flex gap-2 mt-4">
            <Link href="/signup" className="rounded-lg bg-accent text-white text-sm font-semibold px-4 py-2">
              はじめる
            </Link>
            <Link href="/treasury" className="rounded-lg border border-line-strong text-sm font-semibold px-4 py-2">
              金庫を見る
            </Link>
          </div>
        </div>
      )}

      <Link
        href="/news"
        className="flex items-center justify-between rounded-xl border border-line bg-surface-2 p-4 hover:border-line-strong"
      >
        <span className="text-sm font-bold">📰 ニュースを読んで予測に参加する（実験機能）</span>
        <span className="text-xs text-accent-ink font-semibold">見る &gt;</span>
      </Link>

      <section className="rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-ink-muted">金庫(Treasury)残高</span>
          <Link href="/treasury" className="text-xs text-accent-ink font-semibold">
            詳細 &gt;
          </Link>
        </div>
        <p className="font-mono-num text-2xl font-extrabold text-accent-ink mt-1">
          {formatPoints(treasury.balance)}
        </p>
      </section>

      {profile && (
        <section className="rounded-xl border border-line bg-surface p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold">今日のタスク</h2>
            <Link href="/tasks" className="text-xs text-accent-ink font-semibold">
              タスクセンターへ &gt;
            </Link>
          </div>
          {openTasks.length === 0 ? (
            <p className="text-xs text-ink-faint">完了できるタスクはありません。また後で確認してください。</p>
          ) : (
            <ul className="space-y-2">
              {openTasks.slice(0, 3).map((task) => (
                <li key={task.id} className="flex items-center justify-between text-sm">
                  <span>{task.type === "ad_view" ? "🎬" : "📋"} {task.title}</span>
                  <span className="font-mono-num text-accent-ink font-semibold">
                    +{formatPoints(task.reward_points)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">受付中のマーケット</h2>
          <Link href="/markets" className="text-xs text-accent-ink font-semibold">
            一覧へ &gt;
          </Link>
        </div>

        {featuredMarkets.length === 0 ? (
          <p className="text-xs text-ink-faint rounded-xl border border-line bg-surface p-4">
            現在受付中のマーケットはありません。
          </p>
        ) : (
          <ul className="space-y-3">
            {featuredMarkets.map((market, i) => (
              <li key={market.id}>
                <Link
                  href={`/markets/${market.id}`}
                  className="block rounded-xl border border-line bg-surface p-4 hover:border-line-strong space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-sm">
                      {market.market_kind === "match_winner" ? "⚽" : "❓"} {marketHeading(market)}
                    </span>
                    <StatusBadge status={market.status} />
                  </div>
                  <p className="text-xs text-ink-faint">
                    キックオフ {formatRelativeToNow(market.kickoff_time)}
                  </p>
                  <OutcomeBar pool={summarizePools(pools[i], market.outcome_options)} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
