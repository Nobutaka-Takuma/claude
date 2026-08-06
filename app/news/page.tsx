import { getCurrentProfile } from "@/lib/auth";
import { getNewsFeed, getMarketPools, getCommentsForArticle } from "@/lib/data";
import {
  MARKET_CREATION_COST,
  MARKET_CREATOR_FEE_BPS,
  MARKET_SEED_BPS,
  MARKET_APPROVAL_THRESHOLD,
  MARKET_BAN_THRESHOLD,
} from "@/lib/config";
import NewsArticleCard from "@/components/NewsArticleCard";
import RefreshNewsButton from "@/components/RefreshNewsButton";
import type { MarketPool } from "@/lib/types";

export default async function NewsPage() {
  const [profile, articles] = await Promise.all([getCurrentProfile(), getNewsFeed()]);

  const marketIds = articles.flatMap((a) => a.markets.map((m) => m.id));
  const poolLists = await Promise.all(marketIds.map((id) => getMarketPools(id)));
  const poolsByMarket: Record<string, MarketPool[]> = Object.fromEntries(
    marketIds.map((id, i) => [id, poolLists[i]])
  );

  const commentLists = await Promise.all(articles.map((a) => getCommentsForArticle(a.id)));

  const creationCost = MARKET_CREATION_COST();
  const creatorFeePct = MARKET_CREATOR_FEE_BPS() / 100;
  const seedAmount = Math.floor((MARKET_CREATION_COST() * MARKET_SEED_BPS()) / 10000);
  const approvalThreshold = MARKET_APPROVAL_THRESHOLD();

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-lg font-extrabold">ニュースから予測する</h1>
          {profile?.role === "admin" && <RefreshNewsButton />}
        </div>
        <p className="text-xs text-ink-faint mt-1">
          ニュースを読んで、その場で予想に参加。気になる論点があればあなたがマーケットを作れます（{creationCost}pt）。
          あなたのマーケットが盛り上がるほど、手数料の{creatorFeePct}%が報酬として入ります。
        </p>
      </div>

      {articles.length === 0 ? (
        <p className="text-xs text-ink-faint rounded-xl border border-line bg-surface p-4">
          まだニュースはありません。
        </p>
      ) : (
        <div className="space-y-4">
          {articles.map((article, i) => (
            <NewsArticleCard
              key={article.id}
              article={article}
              poolsByMarket={poolsByMarket}
              comments={commentLists[i]}
              profile={profile}
              creationCost={creationCost}
              creatorFeePct={creatorFeePct}
          seedAmount={seedAmount}
              approvalThreshold={approvalThreshold}
              banThreshold={MARKET_BAN_THRESHOLD()}
            />
          ))}
        </div>
      )}
    </div>
  );
}
