import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { getProposedMarkets, getProposalVoteCount, hasVotedOnProposal } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { marketHeading } from "@/lib/outcome";
import {
  MARKET_CREATION_COST,
  MARKET_CREATOR_FEE_BPS,
  MARKET_SEED_BPS,
  MARKET_APPROVAL_THRESHOLD,
  MARKET_BAN_THRESHOLD,
} from "@/lib/config";
import MarketFormTabs from "@/components/MarketFormTabs";
import VoteProposalButton from "@/components/VoteProposalButton";

export default async function ProposeMarketPage() {
  const profile = await getCurrentProfile();
  const proposals = await getProposedMarkets();
  const voteCounts = await Promise.all(proposals.map((p) => getProposalVoteCount(p.id)));
  const votedFlags = profile
    ? await Promise.all(proposals.map((p) => hasVotedOnProposal(p.id, profile.id)))
    : proposals.map(() => false);

  const creationCost = MARKET_CREATION_COST();
  const creatorFeePct = MARKET_CREATOR_FEE_BPS() / 100;
  const seedAmount = Math.floor((MARKET_CREATION_COST() * MARKET_SEED_BPS()) / 10000);
  const approvalThreshold = MARKET_APPROVAL_THRESHOLD();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-extrabold">マーケットを作る</h1>
        <p className="text-xs text-ink-faint mt-1">
          あなたが立てた問いに、みんながポイントを賭けます。盛り上がったマーケットほど作成者の報酬が増えます。
        </p>
      </div>

      {profile ? (
        <MarketFormTabs
          creationCost={creationCost}
          creatorFeePct={creatorFeePct}
          seedAmount={seedAmount}
          approvalThreshold={approvalThreshold}
          banThreshold={MARKET_BAN_THRESHOLD()}
          balance={Number(profile.points_balance)}
        />
      ) : (
        <p className="text-sm text-ink-muted rounded-xl border border-line bg-surface p-4">
          マーケットを作るには
          <Link href="/login" className="text-accent-ink font-semibold mx-1">
            ログイン
          </Link>
          してください。
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-bold">承認待ちの提案（賛成 {approvalThreshold}票で公開）</h2>
        {proposals.length === 0 && <p className="text-xs text-ink-faint">承認待ちの提案はありません。</p>}
        <ul className="space-y-2">
          {proposals.map((p, i) => (
            <li key={p.id} className="rounded-xl border border-line bg-surface p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">
                  {p.market_kind === "match_winner" ? "⚽" : "❓"} {marketHeading(p)}
                </span>
                <span className="font-mono-num text-xs text-ink-faint">
                  賛成 {voteCounts[i]}/{approvalThreshold}
                </span>
              </div>
              <p className="text-xs text-ink-faint">締切 {formatDateTime(p.kickoff_time)}</p>
              {p.description && <p className="text-xs text-ink-muted">{p.description}</p>}
              {profile && <VoteProposalButton marketId={p.id} alreadyVoted={votedFlags[i]} />}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
