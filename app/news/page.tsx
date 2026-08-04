import { getCurrentProfile } from "@/lib/auth";
import { getNewsFeed, getMarketPools, getCommentsForArticle } from "@/lib/data";
import NewsArticleCard from "@/components/NewsArticleCard";
import type { MarketPool } from "@/lib/types";

export default async function NewsPage() {
  const [profile, articles] = await Promise.all([getCurrentProfile(), getNewsFeed()]);

  const marketIds = articles.flatMap((a) => a.markets.map((m) => m.id));
  const poolLists = await Promise.all(marketIds.map((id) => getMarketPools(id)));
  const poolsByMarket: Record<string, MarketPool[]> = Object.fromEntries(
    marketIds.map((id, i) => [id, poolLists[i]])
  );

  const commentLists = await Promise.all(articles.map((a) => getCommentsForArticle(a.id)));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-extrabold">ニュースから予測する</h1>
        <p className="text-xs text-ink-faint mt-1">
          気になるニュースを読んで、その場でコミュニティの予想に参加してみましょう。
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
            />
          ))}
        </div>
      )}
    </div>
  );
}
