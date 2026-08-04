import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import { summarizePools } from "@/lib/pool";
import { outcomeLabel } from "@/lib/outcome";
import type { Comment, MarketPool, NewsFeedItem, Profile } from "@/lib/types";
import OutcomeBar from "@/components/OutcomeBar";
import BetForm from "@/components/BetForm";
import StatusBadge from "@/components/StatusBadge";
import CommentSection from "@/components/CommentSection";

const CATEGORY_ICON: Record<string, string> = {
  economy: "📰",
  sports: "⚽",
  general: "📰",
};

export default function NewsArticleCard({
  article,
  poolsByMarket,
  comments,
  profile,
}: {
  article: NewsFeedItem;
  poolsByMarket: Record<string, MarketPool[]>;
  comments: Comment[];
  profile: Profile | null;
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

      {article.markets.length > 0 && (
        <div className="border-t border-line bg-surface-2 p-4 space-y-3">
          <p className="text-xs font-bold text-ink-muted">🎯 このニュースに関するコミュニティ予想</p>
          {article.markets.map((market) => {
            const pool = summarizePools(poolsByMarket[market.id] ?? [], market.outcome_options);
            return (
              <div key={market.id} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/markets/${market.id}`} className="text-sm font-semibold hover:underline">
                    {market.title}
                  </Link>
                  <StatusBadge status={market.status} />
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
                    <p className="text-xs text-ink-muted">
                      予想に参加するには
                      <Link href="/login" className="text-accent-ink font-semibold mx-1">
                        ログイン
                      </Link>
                      してください。
                    </p>
                  )
                ) : market.status === "resolved" ? (
                  <p className="text-xs font-bold">結果: {outcomeLabel(market.outcome_options, market.outcome)}</p>
                ) : (
                  <OutcomeBar pool={pool} />
                )}

                <Link href={`/markets/${market.id}`} className="text-[11px] text-accent-ink font-semibold">
                  詳細・全選択肢を見る &gt;
                </Link>
              </div>
            );
          })}
        </div>
      )}

      <div className="border-t border-line p-4">
        <CommentSection newsArticleId={article.id} comments={comments} canPost={!!profile} />
      </div>
    </article>
  );
}
