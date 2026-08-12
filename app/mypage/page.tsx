import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { getUserBets, getUserTreasuryLogs, type TreasuryLogWithContext } from "@/lib/data";
import { formatDateTime, formatPoints, formatRelativeToNow, isPast } from "@/lib/format";
import { provisionalState } from "@/lib/provisional";
import { marketHeading, outcomeLabel } from "@/lib/outcome";
import { userLedgerLabel } from "@/lib/ledgerLabels";
import { BET_CANCEL_PENALTY } from "@/lib/config";
import CancelBetButton from "@/components/CancelBetButton";
import LegalLinks from "@/components/LegalLinks";

// One line of context under each ledger entry, so "保証金 −100pt" says
// which market it was for — and, for a bet, which side was backed.
function logContext(log: TreasuryLogWithContext): string | null {
  if (!log.market_title) return log.task_title;

  const heading = marketHeading({
    market_kind: log.market_kind ?? "binary",
    title: log.market_title,
    home_team: log.home_team,
    away_team: log.away_team,
  });

  if (log.bet_outcome && log.outcome_options) {
    return `${heading} ・「${outcomeLabel(log.outcome_options, log.bet_outcome)}」`;
  }
  return heading;
}

export default async function MyPage({ searchParams }: PageProps<"/mypage">) {
  const params = await searchParams;
  const tab = typeof params.tab === "string" ? params.tab : "bets";

  const profile = await getCurrentProfile();
  if (!profile) {
    return (
      <p className="text-sm rounded-xl border border-line bg-surface p-4">
        マイページを見るには
        <Link href="/login" className="text-accent-ink font-semibold mx-1">
          ログイン
        </Link>
        してください。
      </p>
    );
  }

  const [bets, logs] = await Promise.all([getUserBets(profile.id), getUserTreasuryLogs(profile.id)]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-extrabold">マイページ</h1>
        <p className="font-mono-num text-sm text-ink-muted mt-1">
          保有ポイント:{" "}
          <span className="font-bold text-accent-ink">{formatPoints(profile.points_balance)}</span>
        </p>
      </div>

      <div className="flex gap-2 text-xs font-semibold">
        <Link
          href="/mypage?tab=bets"
          className={`px-3 py-1.5 rounded-full ${tab === "bets" ? "bg-accent text-white" : "border border-line-strong text-ink-muted"}`}
        >
          予想の履歴
        </Link>
        <Link
          href="/mypage?tab=points"
          className={`px-3 py-1.5 rounded-full ${tab === "points" ? "bg-accent text-white" : "border border-line-strong text-ink-muted"}`}
        >
          ポイント履歴
        </Link>
      </div>

      {tab === "bets" ? (
        bets.length === 0 ? (
          <p className="text-xs text-ink-faint">まだ予想はありません。</p>
        ) : (
          <ul className="space-y-2">
            {bets.map((b) => (
              <li key={b.id} className="rounded-xl border border-line bg-surface p-3 space-y-1">
                <Link
                  href={`/markets/${b.market_id}`}
                  className="flex items-start justify-between gap-2 text-sm hover:underline"
                >
                  <span>
                    {marketHeading(b)} ・ {outcomeLabel(b.outcome_options, b.outcome)}に{" "}
                    {formatPoints(b.amount)}
                  </span>
                  <span className="font-mono-num font-semibold whitespace-nowrap">
                    {b.status === "active" &&
                      (() => {
                        const state = provisionalState(
                          b.status,
                          b.status_market,
                          b.outcome,
                          b.market_outcome
                        );
                        if (state === "hit") return <span className="text-gold">暫定 的中</span>;
                        if (state === "miss") return <span className="text-ink-faint">暫定 不的中</span>;
                        return "結果待ち";
                      })()}
                    {b.status === "won" && (
                      <span className="text-accent-ink">的中 +{formatPoints(b.payout_amount)}</span>
                    )}
                    {b.status === "lost" && <span className="text-ink-faint">不的中</span>}
                    {b.status === "refunded" && <span className="text-ink-faint">返金済み</span>}
                    {b.status === "void" && <span className="text-ink-faint">取消済み</span>}
                  </span>
                </Link>
                <p className="text-[11px] text-ink-faint">
                  {/* 暫定が出ているときは、締切より「いつ確定するか」のほうが
                      知りたい情報になる。 */}
                  {b.status === "active" && b.market_outcome && b.dispute_deadline ? (
                    <>
                      この結果のまま {formatRelativeToNow(b.dispute_deadline)} に確定します
                      {b.status_market === "disputed" && "（異議申し立て中）"}
                    </>
                  ) : (
                    <>
                      受付締切 {formatDateTime(b.kickoff_time)} ・ 結果判定の予定{" "}
                      {b.resolves_at ? formatDateTime(b.resolves_at) : "未設定"}
                    </>
                  )}
                </p>
                {/* Only while the market is still taking bets. Once the
                    deadline passes a prediction is locked in — being able
                    to withdraw after that is a free look at the outcome. */}
                {b.status === "active" && b.status_market === "open" && !isPast(b.kickoff_time) && (
                  <CancelBetButton betId={b.id} amount={Number(b.amount)} penalty={BET_CANCEL_PENALTY()} />
                )}
              </li>
            ))}
          </ul>
        )
      ) : logs.length === 0 ? (
        <p className="text-xs text-ink-faint">ポイントの動きはまだありません。</p>
      ) : (
        <ul className="space-y-1">
          {logs.map((log) => {
            const context = logContext(log);
            const delta = Number(log.points_delta);
            const row = (
              <>
                <span className="min-w-0">
                  <span className="block">{userLedgerLabel(log.entry_type, delta)}</span>
                  {context && <span className="block text-[11px] text-ink-muted truncate">{context}</span>}
                  <span className="block text-[11px] text-ink-faint">{formatDateTime(log.created_at)}</span>
                </span>
                {/* A 0pt row is a record, not a movement — the points
                    already left when the bond was posted. "+0pt" invites
                    the reader to hunt for a number that isn't there. */}
                {delta === 0 ? (
                  <span className="font-mono-num text-ink-faint shrink-0">—</span>
                ) : (
                  <span
                    className={`font-mono-num font-bold shrink-0 ${delta > 0 ? "text-accent-ink" : "text-neg"}`}
                  >
                    {delta > 0 ? "+" : ""}
                    {formatPoints(delta)}
                  </span>
                )}
              </>
            );

            return (
              <li key={log.id}>
                {log.market_id ? (
                  <Link
                    href={`/markets/${log.market_id}`}
                    className="flex items-start justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm hover:border-line-strong"
                  >
                    {row}
                  </Link>
                ) : (
                  <div className="flex items-start justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
                    {row}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* 規約類への導線。β版の間はフッターに出さないので、ここが唯一の
          入口になる（URLでは常にアクセスできる）。一般公開時は
          SHOW_LEGAL_FOOTER=true でフッターにも並ぶ。 */}
      <div className="pt-4 border-t border-line space-y-2">
        <LegalLinks muted />
        <p className="text-[11px] text-ink-faint">
          ポイントは現金・商品等と交換できません。購入も譲渡もできません。
        </p>
      </div>
    </div>
  );
}
