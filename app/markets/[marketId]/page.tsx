import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import {
  getMarketById,
  getMarketPools,
  getUserBetForMarket,
  getChallengesForMarket,
  getVotesForChallenge,
} from "@/lib/data";
import { formatDateTime, formatPoints, formatRelativeToNow } from "@/lib/format";
import { summarizePools } from "@/lib/pool";
import { marketHeading, outcomeLabel } from "@/lib/outcome";
import { RESOLUTION_BOND, DISPUTE_WINDOW_MINUTES } from "@/lib/config";
import OutcomeBar from "@/components/OutcomeBar";
import StatusBadge from "@/components/StatusBadge";
import BetForm from "@/components/BetForm";
import RaiseChallengeForm from "@/components/RaiseChallengeForm";
import ChallengeVoteButtons from "@/components/ChallengeVoteButtons";
import AdminResolveForm from "@/components/AdminResolveForm";
import SubmitResultForm from "@/components/SubmitResultForm";
import VoidMarketButton from "@/components/VoidMarketButton";

export default async function MarketDetailPage({ params }: PageProps<"/markets/[marketId]">) {
  const { marketId } = await params;
  const [market, profile] = await Promise.all([getMarketById(marketId), getCurrentProfile()]);
  if (!market) notFound();

  const pools = await getMarketPools(marketId);
  const pool = summarizePools(pools, market.outcome_options);
  const myBets = profile ? await getUserBetForMarket(marketId, profile.id) : [];

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
            {market.market_kind === "match_winner" ? "⚽" : "❓"} {marketHeading(market)}
          </h1>
          <StatusBadge status={market.status} />
        </div>
        <p className="text-xs text-ink-faint mt-1">
          {market.market_kind === "match_winner" ? "キックオフ" : "判定期限"} {formatDateTime(market.kickoff_time)} （{formatRelativeToNow(market.kickoff_time)}）
        </p>
        {market.description && <p className="text-sm text-ink-muted mt-2">{market.description}</p>}
      </div>

      <section className="rounded-xl border border-line bg-surface p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-ink-muted">現在のプール比率</span>
          <span className="font-mono-num text-xs text-ink-faint">{formatPoints(pool.total)}</span>
        </div>
        <OutcomeBar pool={pool} />
        <p className="text-[11px] text-ink-faint">
          的中者には賭けた分が全額戻り、さらに他の選択肢のプールから運営手数料(テラ銭){(market.rake_bps / 100).toFixed(0)}%を除いた分を山分けします。他の選択肢に誰もベットしていない場合、手数料はかからず賭けた分がそのまま戻ります。
        </p>
      </section>

      {market.status === "resolved" && (
        <section className="rounded-xl border border-line bg-surface-2 p-4">
          <p className="text-sm font-bold">結果: {outcomeLabel(market.outcome_options, market.outcome)}</p>
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

      {market.status === "open" && (
        <section className="rounded-xl border border-line bg-surface p-4 space-y-3">
          <h2 className="text-sm font-bold">ベットする</h2>
          {profile ? (
            <BetForm
              marketId={market.id}
              pool={pool}
              outcomeOptions={market.outcome_options}
              rakeBps={market.rake_bps}
              maxAmount={Number(profile.points_balance)}
            />
          ) : (
            <p className="text-xs text-ink-muted">
              ベットするには
              <Link href="/login" className="text-accent-ink font-semibold mx-1">
                ログイン
              </Link>
              してください。
            </p>
          )}
          <p className="text-[11px] text-neg">⚠ キックオフ後は自動的にベット不可になります</p>
          {profile?.role === "admin" && (
            <div className="pt-2 border-t border-line">
              <VoidMarketButton marketId={market.id} />
            </div>
          )}
        </section>
      )}

      {myBets.length > 0 && (
        <section className="rounded-xl border border-line bg-surface p-4 space-y-2">
          <h2 className="text-sm font-bold">自分のベット</h2>
          <ul className="space-y-1 text-sm">
            {myBets.map((b) => (
              <li key={b.id} className="flex justify-between">
                <span>
                  {outcomeLabel(market.outcome_options, b.outcome)} に {formatPoints(b.amount)}
                </span>
                <span className="font-mono-num font-semibold">
                  {b.status === "active" && "結果待ち"}
                  {b.status === "won" && `的中 +${formatPoints(b.payout_amount)}`}
                  {b.status === "lost" && "不的中"}
                  {b.status === "refunded" && "返金済み"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {disputable && profile && (
        <section className="rounded-xl border border-line bg-surface p-4 space-y-3">
          <h2 className="text-sm font-bold">異議申し立て / DAO投票</h2>
          {!openChallenge && <RaiseChallengeForm marketId={market.id} />}

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
    </div>
  );
}
