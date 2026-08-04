import Link from "next/link";
import { formatDateTime, formatPoints, formatRelativeToNow } from "@/lib/format";
import { summarizePools } from "@/lib/pool";
import { outcomeLabel } from "@/lib/outcome";
import type { Comment, MarketPool, NewsFeedItem, Profile } from "@/lib/types";
import OutcomeBar from "@/components/OutcomeBar";
import BetForm from "@/components/BetForm";
import StatusBadge from "@/components/StatusBadge";
import CommentSection from "@/components/CommentSection";
import CreateMarketFromNews from "@/components/CreateMarketFromNews";

const CATEGORY_ICON: Record<string, string> = {
  economy: "💹",
  sports: "⚽",
  politics: "🏛",
  tech: "💻",
  general: "📰",
};

export default function NewsArticleCard({
  article,
  poolsByMarket,
  comments,
  profile,
  creationCost,
  creatorFeePct,
  approvalThreshold,
}: {
  article: NewsFeedItem;
  poolsByMarket: Record<string, MarketPool[]>;
  comments: Comment[];
  profile: Profile | null;
  creationCost: number;
  creatorFeePct: number;
  approvalThreshold: number;
}) {
  return (
    <article className="rounded-xl border border-line bg-surface overflow-hidden">
      <div className="p-4 space-y-2">
        <div className="flex items-center gap-2 text-[11px] text-ink-faint">
          <span>{CATEGORY_ICON[article.category] ?? "📰"}</span>
          <span>{formatDateTime(article.published_at)}</span>
          <span>|</span>
          <span>{article.source}</span>
        </div>
        <h2 className="text-base font-extrabold leading-snug">{article.title}</h2>
        <p className="text-sm text-ink-muted whitespace-pre-wrap leading-relaxed">{article.body}</p>
      </div>

      <div className="border-t border-line bg-surface-2 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-ink-muted">
            🎯 このニュースの予想マーケット
            {article.markets.length > 0 && `（${article.markets.length}）`}
          </p>
        </div>

        {article.markets.length === 0 && (
          <p className="text-xs text-ink-faint">
            まだ誰もマーケットを作っていません。あなたが最初の一人になりましょう。
          </p>
        )}

        {article.markets.map((market) => {
          const pool = summarizePools(poolsByMarket[market.id] ?? [], market.outcome_options);
          return (
            <div key={market.id} className="rounded-lg bg-surface border border-line p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/markets/${market.id}`} className="text-sm font-bold leading-snug hover:underline">
                  {market.title}
                </Link>
                <StatusBadge status={market.status} />
              </div>

              <div className="flex items-center gap-3 text-[10px] text-ink-faint font-mono-num">
                <span>出来高 {formatPoints(pool.total)}</span>
                <span>締切 {formatRelativeToNow(market.kickoff_time)}</span>
              </div>

              {market.status === "open" ? (
                profile ? (
                  <BetForm
                    marketId={market.id}
                    pool={pool}
                    outcomeOptions={market.outcome_options}
                    rakeBps={market.rake_bps}
                    maxAmount={Number(profile.points_balance)}
                    compact
                  />
                ) : (
                  <>
                    <OutcomeBar pool={pool} />
                    <p className="text-xs text-ink-muted">
                      予想に参加するには
                      <Link href="/login" className="text-accent-ink font-semibold mx-1">
                        ログイン
                      </Link>
                      してください。
                    </p>
                  </>
                )
              ) : market.status === "resolved" ? (
                <p className="text-xs font-bold">
                  結果: {outcomeLabel(market.outcome_options, market.outcome)}
                </p>
              ) : (
                <OutcomeBar pool={pool} />
              )}
            </div>
          );
        })}

        <CreateMarketFromNews
          newsArticleId={article.id}
          category={article.category}
          creationCost={creationCost}
          creatorFeePct={creatorFeePct}
          approvalThreshold={approvalThreshold}
          isLoggedIn={!!profile}
          balance={profile ? Number(profile.points_balance) : 0}
        />
      </div>

      <div className="border-t border-line p-4">
        <CommentSection newsArticleId={article.id} comments={comments} canPost={!!profile} />
      </div>
    </article>
  );
}
