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
  const pool = summarizePools(pools);
  const myBets = profile ? await getUserBetForMarket(marketId, profile.id) : [];

  const disputable = market.status === "pending_resolution" || market.status === "disputed";
  const challenges = disputable ? await getChallengesForMarket(marketId) : [];
  const openChallenge = challenges.find((c) => c.status === "open");
  const votes = openChallenge ? await getVotesForChallenge(openChallenge.id) : [];
  const voteTally = { home: 0, draw: 0, away: 0 };
  for (const v of votes) {
    if (v.voted_outcome in voteTally) voteTally[v.voted_outcome as "home" | "draw" | "away"] += Number(v.voting_power);
  }
  const voteTotal = voteTally.home + voteTally.draw + voteTally.away;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/markets" className="text-xs text-ink-faint">
          &lt; マーケット一覧
        </Link>
        <div className="flex items-center justify-between gap-2 mt-1">
          <h1 className="text-lg font-extrabold">
            ⚽ {market.home_team} vs {market.away_team}
          </h1>
          <StatusBadge status={market.status} />
        </div>
        <p className="text-xs text-ink-faint mt-1">
          キックオフ {formatDateTime(market.kickoff_time)} （{formatRelativeToNow(market.kickoff_time)}）
        </p>
        {market.description && <p className="text-sm text-ink-muted mt-2">{market.description}</p>}
      </div>

      <section className="rounded-xl border border-line bg-surface p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-ink-muted">現在のプール比率</span>
          <span className="font-mono-num text-xs text-ink-faint">{formatPoints(pool.total)}</span>
        </div>
        <OutcomeBar pool={pool} homeLabel={market.home_team} awayLabel={market.away_team} />
        <p className="text-[11px] text-ink-faint">
          的中者には賭けた分が全額戻り、さらに逆側のプールから運営手数料(テラ銭){(market.rake_bps / 100).toFixed(0)}%を除いた分を山分けします。反対側に誰もベットしていない場合、手数料はかからず賭けた分がそのまま戻ります。
        </p>
      </section>

      {market.status === "resolved" && (
        <section className="rounded-xl border border-line bg-surface-2 p-4">
          <p className="text-sm font-bold">結果: {outcomeLabel(market)}</p>
        </section>
      )}

      {(market.status === "pending_resolution" || market.status === "disputed") && (
        <section className="rounded-xl border border-gold/50 bg-gold-soft p-4 space-y-1">
          <p className="text-sm font-bold text-gold">一次判定: {outcomeLabel(market)}</p>
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
              homeLabel={market.home_team}
              awayLabel={market.away_team}
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
                  {b.outcome === "home" ? market.home_team : b.outcome === "away" ? market.away_team : "引分"} に{" "}
                  {formatPoints(b.amount)}
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
              <OutcomeBar
                pool={{
                  home: voteTally.home,
                  draw: voteTally.draw,
                  away: voteTally.away,
                  total: voteTotal,
                  homePct: voteTotal ? Math.round((voteTally.home / voteTotal) * 100) : 0,
                  drawPct: voteTotal ? Math.round((voteTally.draw / voteTotal) * 100) : 0,
                  awayPct: voteTotal ? Math.round((voteTally.away / voteTotal) * 100) : 0,
                }}
                homeLabel={market.home_team}
                awayLabel={market.away_team}
              />
              <ChallengeVoteButtons
                challengeId={openChallenge.id}
                homeLabel={market.home_team}
                awayLabel={market.away_team}
              />
            </div>
          )}
        </section>
      )}

      {profile?.role === "admin" && market.status === "locked" && (
        <div className="space-y-2">
          <SubmitResultForm marketId={market.id} homeLabel={market.home_team} awayLabel={market.away_team} />
          <VoidMarketButton marketId={market.id} />
        </div>
      )}

      {profile?.role === "admin" && (market.status === "pending_resolution" || market.status === "disputed") && (
        <AdminResolveForm marketId={market.id} homeLabel={market.home_team} awayLabel={market.away_team} />
      )}
    </div>
  );
}

function outcomeLabel(market: { outcome: string | null; home_team: string; away_team: string }) {
  if (market.outcome === "home") return `${market.home_team} 勝ち`;
  if (market.outcome === "away") return `${market.away_team} 勝ち`;
  if (market.outcome === "draw") return "引き分け";
  return "中止・返金";
}
