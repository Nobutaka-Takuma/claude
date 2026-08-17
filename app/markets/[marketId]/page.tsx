import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import {
  getMarketById,
  getMarketPools,
  getUserBetForMarket,
  getChallengesForMarket,
  getVotesForChallenge,
  getNewsArticleById,
  getActiveReportCount,
  hasReportedMarket,
} from "@/lib/data";
import { categoryIcon, categoryLabel } from "@/lib/categories";
import { formatDateTime, formatPoints, formatRelativeToNow, isPast } from "@/lib/format";
import { summarizePools } from "@/lib/pool";
import { provisionalState, estimateSettlementPayout } from "@/lib/provisional";
import { marketHeading, outcomeLabel } from "@/lib/outcome";
import {
  RESOLUTION_BOND,
  RESOLUTION_REWARD,
  DISPUTE_WINDOW_MINUTES,
  CHALLENGE_BOND,
  CHALLENGE_VOTING_HOURS,
  EARLY_RESOLUTION_BOND,
  EARLY_RESOLUTION_VOTING_HOURS,
  BOND_AWARD_BPS,
  BET_CANCEL_PENALTY,
  VOTER_RAKE_SHARE_BPS,
  VOTE_FLAT_REWARD,
  VOTE_REWARD_SLOTS,
  MARKET_BAN_THRESHOLD,
  REPORT_REWARD,
} from "@/lib/config";
import OutcomeBar from "@/components/OutcomeBar";
import StatusBadge from "@/components/StatusBadge";
import BetForm from "@/components/BetForm";
import RaiseChallengeForm from "@/components/RaiseChallengeForm";
import ChallengeVoteButtons from "@/components/ChallengeVoteButtons";
import AdminResolveForm from "@/components/AdminResolveForm";
import SubmitResultForm from "@/components/SubmitResultForm";
import VoidMarketButton from "@/components/VoidMarketButton";
import EarlyResolutionForm from "@/components/EarlyResolutionForm";
import CancelBetButton from "@/components/CancelBetButton";
import RelatedMarkets from "@/components/RelatedMarkets";
import ReportMarketButton from "@/components/ReportMarketButton";
import ShareMarketButton from "@/components/ShareMarketButton";

export default async function MarketDetailPage({ params }: PageProps<"/markets/[marketId]">) {
  const { marketId } = await params;
  const [market, profile] = await Promise.all([getMarketById(marketId), getCurrentProfile()]);
  if (!market) notFound();

  const pools = await getMarketPools(marketId);
  const pool = summarizePools(pools, market.outcome_options);
  const myBets = profile ? await getUserBetForMarket(marketId, profile.id) : [];
  const sourceArticle = market.news_article_id
    ? await getNewsArticleById(market.news_article_id)
    : null;

  const reportCount = await getActiveReportCount(market);
  const alreadyReported = profile ? await hasReportedMarket(marketId, profile.id) : false;
  // A market that's already been removed, or that has settled, is past the
  // point where reporting it changes anything.
  const reportable =
    market.banned_at === null &&
    ["proposed", "open", "locked", "pending_resolution", "disputed"].includes(market.status);

  // Cancelling is only allowed while the market is still taking bets.
  // Checked against kickoff_time rather than the stored status alone: the
  // status is moved to 'locked' by a lazy sweep, so between the deadline
  // and the next sweep it can still say 'open'. The RPC enforces the same
  // rule, so this only decides whether the button is worth showing.
  const bettingOpen = market.status === "open" && !isPast(market.kickoff_time);

  const disputable = market.status === "pending_resolution" || market.status === "disputed";
  const challenges = disputable ? await getChallengesForMarket(marketId) : [];
  const openChallenge = challenges.find((c) => c.status === "open");
  const votes = openChallenge ? await getVotesForChallenge(openChallenge.id) : [];
  const voteAmounts = new Map<string, number>();
  for (const v of votes) {
    voteAmounts.set(v.voted_outcome, (voteAmounts.get(v.voted_outcome) ?? 0) + Number(v.voting_power));
  }
  const voteTotal = [...voteAmounts.values()].reduce((a, b) => a + b, 0);
  const votePool = {
    total: voteTotal,
    options: market.outcome_options.map((o) => {
      const amount = voteAmounts.get(o.key) ?? 0;
      return { key: o.key, label: o.label, amount, pct: voteTotal ? Math.round((amount / voteTotal) * 100) : 0 };
    }),
  };

  return (
    <div className="space-y-5">
      <div>
        <Link href="/markets" className="text-xs text-ink-faint">
          &lt; マーケット一覧
        </Link>
        <div className="flex items-center justify-between gap-2 mt-1">
          <h1 className="text-lg font-extrabold">
            {categoryIcon(market.category)} {marketHeading(market)}
          </h1>
          <StatusBadge status={market.status} banned={market.banned_at !== null} />
        </div>

        <div className="flex flex-wrap gap-1.5 mt-2 text-[11px] font-semibold">
          <Link
            href={`/markets?category=${encodeURIComponent(market.category)}`}
            className="rounded-full border border-line px-2.5 py-0.5 text-ink-faint"
          >
            {categoryLabel(market.category)}
          </Link>
          {market.league && (
            <Link
              href={`/markets?league=${encodeURIComponent(market.league)}`}
              className="rounded-full border border-line px-2.5 py-0.5 text-ink-faint"
            >
              {market.league}
            </Link>
          )}
          {market.matchweek !== null && market.league && (
            <Link
              href={`/markets?league=${encodeURIComponent(market.league)}&matchweek=${market.matchweek}`}
              className="rounded-full border border-line px-2.5 py-0.5 text-ink-faint font-mono-num"
            >
              第{market.matchweek}節
            </Link>
          )}
        </div>

        <dl className="mt-2 space-y-0.5 text-xs text-ink-faint">
          <div className="flex gap-2">
            <dt className="w-20 shrink-0">受付締切</dt>
            <dd>
              {formatDateTime(market.kickoff_time)}（{formatRelativeToNow(market.kickoff_time)}）
            </dd>
          </div>
          {market.resolves_at && (
            <div className="flex gap-2">
              <dt className="w-20 shrink-0">判定予定</dt>
              <dd>
                {formatDateTime(market.resolves_at)}（{formatRelativeToNow(market.resolves_at)}）
              </dd>
            </div>
          )}
        </dl>

        {market.description && <p className="text-sm text-ink-muted mt-2">{market.description}</p>}
      </div>

      {sourceArticle && (
        <section className="rounded-xl border border-line bg-surface-2 p-4 space-y-1">
          <span className="text-[10px] font-bold text-ink-faint">📰 このマーケットの元になったニュース</span>
          <p className="text-sm font-bold leading-snug">{sourceArticle.title}</p>
          <p className="text-[11px] text-ink-faint">
            {sourceArticle.source} ・ {formatDateTime(sourceArticle.published_at)}
          </p>
          <p className="text-xs text-ink-muted line-clamp-3">{sourceArticle.body}</p>
          <div className="flex gap-3 pt-1">
            <Link
              href={`/news#news-${sourceArticle.id}`}
              className="text-[11px] text-accent-ink font-semibold"
            >
              ニュースフィードで見る &gt;
            </Link>
            {sourceArticle.url && (
              <a
                href={sourceArticle.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-accent-ink font-semibold"
              >
                元記事を読む ↗
              </a>
            )}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-line bg-surface p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-ink-muted">現在のプール比率</span>
          <span className="font-mono-num text-xs text-ink-faint">{formatPoints(pool.total)}</span>
        </div>
        <OutcomeBar pool={pool} />
        {Number(market.seed_pool) > 0 && (
          <p className="text-[11px] font-semibold text-gold">
            🎁 作成者が積んだ初期賞金 {formatPoints(market.seed_pool)} が的中者に上乗せ分配されます
          </p>
        )}
        <p className="text-[11px] text-ink-faint">
          的中者には賭けた分が全額戻り、さらに他の選択肢のプールから手数料{(market.rake_bps / 100).toFixed(0)}%を差し引いた分と初期賞金を山分けします。
        </p>
      </section>

      {market.banned_at && (
        <section className="rounded-xl border border-neg bg-neg/5 p-4 space-y-1">
          <p className="text-sm font-bold text-neg">🚫 このマーケットは停止されました</p>
          <p className="text-[11px] text-ink-muted">
            {market.ban_reason ?? "ガイドライン違反の通報により停止されました。"}
          </p>
          <p className="text-[11px] text-ink-muted">
            予想されたポイントはすべて返金済みです。作成者が支払った作成料は返金されません。
          </p>
        </section>
      )}

      {/* 中止で終わったマーケット。「中止」バッジだけでは理由が分からず、
          特にBANされたのか無風で終わったのかが区別できない。 */}
      {market.status === "cancelled" && (
        <section className="rounded-xl border border-line bg-surface-2 p-4 space-y-1">
          <p className="text-sm font-bold">このマーケットは中止されました</p>
          {market.ban_reason ? (
            <p className="text-xs text-neg">{market.ban_reason}</p>
          ) : (
            market.resolution_note && (
              <p className="text-xs text-ink-muted whitespace-pre-wrap break-words">
                {market.resolution_note}
              </p>
            )
          )}
          <p className="text-[11px] text-ink-faint">
            予想されていたポイントは全額返金されています。
          </p>
        </section>
      )}

      {market.status === "resolved" && (
        <section className="rounded-xl border border-line bg-surface-2 p-4 space-y-1">
          <p className="text-sm font-bold">結果: {outcomeLabel(market.outcome_options, market.outcome)}</p>
          {/* 確定後も根拠を残す。あとから「なぜこの結果になったのか」を
              辿れないと、精算に納得できない人に説明する手段がなくなる。 */}
          {market.resolution_note && (
            <p className="text-xs text-ink-muted whitespace-pre-wrap break-words">
              {market.resolution_note}
            </p>
          )}
          {market.resolution_evidence_url && (
            <a
              href={market.resolution_evidence_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-accent-ink font-semibold underline break-all"
            >
              🔗 判定の証跡
            </a>
          )}
        </section>
      )}

      {(market.status === "pending_resolution" || market.status === "disputed") && (
        <section className="rounded-xl border border-gold/50 bg-gold-soft p-4 space-y-1">
          <p className="text-sm font-bold text-gold">
            提案されている結果: {outcomeLabel(market.outcome_options, market.outcome)}
          </p>
          <p className="text-[11px] text-ink-muted">
            提案者: {market.resolution_source === "community" ? "コミュニティメンバー" : "運営"}
            {Number(market.resolution_bond) > 0 &&
              `（保証金 ${Number(market.resolution_bond).toLocaleString("ja-JP")}pt を預託中）`}
          </p>
          {/* 異議を出すかどうかを判断する材料。証跡URLを任意にした代わりに
              必須にしているので、報告があれば必ずここに何か入っている。 */}
          {market.resolution_note && (
            <p className="text-xs text-ink whitespace-pre-wrap break-words rounded-lg bg-surface p-2">
              {market.resolution_note}
            </p>
          )}
          {market.resolution_evidence_url && (
            <p className="text-[11px]">
              <a
                href={market.resolution_evidence_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-ink font-semibold underline break-all"
              >
                🔗 証跡を確認する
              </a>
            </p>
          )}
          {market.status === "pending_resolution" && market.dispute_deadline && (
            <p className="text-[11px] text-ink-muted">
              異議申し立て期限 {formatDateTime(market.dispute_deadline)}（{formatRelativeToNow(market.dispute_deadline)}）— 期限までに異議がなければ自動的にこの結果で確定・精算されます。
            </p>
          )}
          {market.status === "disputed" && (
            <p className="text-[11px] text-ink-muted">異議が提出されたため、DAO投票で最終結果を決定します。</p>
          )}
        </section>
      )}

      {bettingOpen && (
        <section className="rounded-xl border border-line bg-surface p-4 space-y-3">
          <h2 className="text-sm font-bold">予想する</h2>
          {profile ? (
            <BetForm
              marketId={market.id}
              pool={pool}
              outcomeOptions={market.outcome_options}
              rakeBps={market.rake_bps}
              seedPool={Number(market.seed_pool)}
              maxAmount={Number(profile.points_balance)}
            />
          ) : (
            <p className="text-xs text-ink-muted">
              予想するには
              <Link href="/login" className="text-accent-ink font-semibold mx-1">
                ログイン
              </Link>
              してください。
            </p>
          )}
          <p className="text-[11px] text-neg">
            ⚠ 締切を過ぎると自動的に受付が終了します。ひとつのマーケットで予想できる選択肢は1つだけです。
          </p>
          {profile && (
            <div className="pt-2 border-t border-line">
              <EarlyResolutionForm
                marketId={market.id}
                outcomeOptions={market.outcome_options}
                bond={EARLY_RESOLUTION_BOND()}
                votingHours={EARLY_RESOLUTION_VOTING_HOURS()}
                balance={Number(profile.points_balance)}
              />
            </div>
          )}
          {profile?.role === "admin" && (
            <div className="pt-2 border-t border-line">
              <VoidMarketButton marketId={market.id} />
            </div>
          )}
        </section>
      )}

      {myBets.length > 0 && (
        <section className="rounded-xl border border-line bg-surface p-4 space-y-2">
          <h2 className="text-sm font-bold">自分の予想</h2>
          <ul className="space-y-2 text-sm">
            {myBets.map((b) => (
              <li key={b.id} className="space-y-0.5">
                <div className="flex justify-between gap-2">
                  <span>
                    {outcomeLabel(market.outcome_options, b.outcome)} に {formatPoints(b.amount)}
                  </span>
                  <span className="font-mono-num font-semibold whitespace-nowrap">
                    {b.status === "active" &&
                      (() => {
                        const state = provisionalState(b.status, market.status, b.outcome, market.outcome);
                        if (state === "hit") {
                          // この結果のまま確定したときに受け取る額。まだ覆る
                          // 可能性があるので「暫定」と明記する。
                          const payout = market.outcome
                            ? estimateSettlementPayout(
                                pool,
                                market.outcome,
                                Number(b.amount),
                                market.rake_bps,
                                Number(market.seed_pool)
                              )
                            : null;
                          return (
                            <span className="text-gold">
                              暫定 的中{payout !== null && ` +${formatPoints(payout)}`}
                            </span>
                          );
                        }
                        if (state === "miss") return <span className="text-ink-faint">暫定 不的中</span>;
                        return "結果待ち";
                      })()}
                    {b.status === "won" && `的中 +${formatPoints(b.payout_amount)}`}
                    {b.status === "lost" && "不的中"}
                    {b.status === "refunded" && "返金済み"}
                    {b.status === "void" && `取消済み（返金 ${formatPoints(b.payout_amount)}）`}
                  </span>
                </div>
                {b.status === "active" && bettingOpen && (
                  <CancelBetButton
                    betId={b.id}
                    amount={Number(b.amount)}
                    penalty={BET_CANCEL_PENALTY()}
                  />
                )}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-ink-faint">
            結果判定の予定:{" "}
            {market.resolves_at ? formatDateTime(market.resolves_at) : "未設定（締切後にコミュニティが報告します）"}
          </p>
        </section>
      )}

      {disputable && profile && (
        <section className="rounded-xl border border-line bg-surface p-4 space-y-3">
          <h2 className="text-sm font-bold">異議申し立て / DAO投票</h2>
          {!openChallenge && (
            <RaiseChallengeForm
              marketId={market.id}
              bond={CHALLENGE_BOND()}
              votingHours={CHALLENGE_VOTING_HOURS()}
              awardPct={BOND_AWARD_BPS() / 100}
              balance={Number(profile.points_balance)}
            />
          )}

          {openChallenge && (
            <div className="space-y-3">
              <div className="text-xs text-ink-muted space-y-1">
                <p>
                  <span className="font-bold text-neg">異議あり: </span>
                  {openChallenge.reason}
                </p>
                <p>投票締切 {formatDateTime(openChallenge.voting_deadline)}</p>
              </div>
              <OutcomeBar pool={votePool} />
              <p className="text-[11px] text-ink-muted">
                正解の選択肢に投票すると、先着{VOTE_REWARD_SLOTS()}名に{VOTE_FLAT_REWARD()}pt、
                さらに正解者全員で手数料の{VOTER_RAKE_SHARE_BPS() / 100}%を分け合えます。
                （現在の投票数: {voteTotal}票）
              </p>
              <ChallengeVoteButtons challengeId={openChallenge.id} outcomeOptions={market.outcome_options} />
            </div>
          )}
        </section>
      )}

      {market.status === "locked" &&
        (profile ? (
          <div className="space-y-2">
            <SubmitResultForm
              marketId={market.id}
              outcomeOptions={market.outcome_options}
              bond={RESOLUTION_BOND()}
              reward={RESOLUTION_REWARD()}
              disputeWindowHours={Math.round(DISPUTE_WINDOW_MINUTES() / 60)}
              isAdmin={profile.role === "admin"}
              balance={Number(profile.points_balance)}
            />
            {profile.role === "admin" && <VoidMarketButton marketId={market.id} />}
          </div>
        ) : (
          <section className="rounded-xl border border-gold/50 bg-gold-soft p-4">
            <p className="text-xs text-ink-muted">
              結果の判定待ちです。判定を提案するには
              <Link href="/login" className="text-accent-ink font-semibold mx-1">
                ログイン
              </Link>
              してください。
            </p>
          </section>
        ))}

      {profile?.role === "admin" && (market.status === "pending_resolution" || market.status === "disputed") && (
        <AdminResolveForm marketId={market.id} outcomeOptions={market.outcome_options} />
      )}

      {/* 反対側に賭ける人がいないとプールができないので、まだ受付中の
          マーケットには人を呼ぶ導線を置く。 */}
      {bettingOpen && (
        <div className="flex justify-center">
          <ShareMarketButton title={marketHeading(market)} />
        </div>
      )}

      <RelatedMarkets market={market} />

      {reportable &&
        (profile ? (
          <ReportMarketButton
            marketId={market.id}
            threshold={MARKET_BAN_THRESHOLD()}
            currentCount={reportCount}
            reward={REPORT_REWARD()}
            alreadyReported={alreadyReported}
          />
        ) : (
          <p className="text-[11px] text-ink-faint text-center">
            不適切なマーケットの通報には
            <Link href="/login" className="text-accent-ink font-semibold mx-1">
              ログイン
            </Link>
            が必要です。
          </p>
        ))}
    </div>
  );
}
