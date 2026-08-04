import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { getProposedMarkets, getProposalVoteCount, hasVotedOnProposal } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import ProposeForm from "@/components/ProposeForm";
import VoteProposalButton from "@/components/VoteProposalButton";

const APPROVAL_THRESHOLD = Number(process.env.MARKET_APPROVAL_THRESHOLD ?? 3);

export default async function ProposeMarketPage() {
  const profile = await getCurrentProfile();
  const proposals = await getProposedMarkets();
  const voteCounts = await Promise.all(proposals.map((p) => getProposalVoteCount(p.id)));
  const votedFlags = profile
    ? await Promise.all(proposals.map((p) => hasVotedOnProposal(p.id, profile.id)))
    : proposals.map(() => false);

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-extrabold">お題を提案する</h1>

      {profile ? (
        <ProposeForm />
      ) : (
        <p className="text-sm text-ink-muted rounded-xl border border-line bg-surface p-4">
          お題を提案するには
          <Link href="/login" className="text-accent-ink font-semibold mx-1">
            ログイン
          </Link>
          してください。
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-bold">承認待ちの提案（賛成 {APPROVAL_THRESHOLD}票で自動オープン）</h2>
        {proposals.length === 0 && <p className="text-xs text-ink-faint">承認待ちの提案はありません。</p>}
        <ul className="space-y-2">
          {proposals.map((p, i) => (
            <li key={p.id} className="rounded-xl border border-line bg-surface p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">
                  ⚽ {p.home_team} vs {p.away_team}
                </span>
                <span className="font-mono-num text-xs text-ink-faint">
                  賛成 {voteCounts[i]}/{APPROVAL_THRESHOLD}
                </span>
              </div>
              <p className="text-xs text-ink-faint">キックオフ {formatDateTime(p.kickoff_time)}</p>
              {p.description && <p className="text-xs text-ink-muted">{p.description}</p>}
              {profile && <VoteProposalButton marketId={p.id} alreadyVoted={votedFlags[i]} />}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
