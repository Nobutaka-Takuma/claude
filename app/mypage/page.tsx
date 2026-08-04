import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { getUserBets, getUserTreasuryLogs } from "@/lib/data";
import { formatDateTime, formatPoints } from "@/lib/format";
import { marketHeading, outcomeLabel } from "@/lib/outcome";

const ENTRY_LABELS: Record<string, string> = {
  task_reward: "タスク完了報酬",
  bet_placed: "ベット",
  bet_payout: "配当",
  bet_refund: "返金",
  treasury_grant: "運営付与",
  adjustment: "補正",
};

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
          保有ポイント: <span className="font-bold text-accent-ink">{formatPoints(profile.points_balance)}</span>
        </p>
      </div>

      <div className="flex gap-2 text-xs font-semibold">
        <Link
          href="/mypage?tab=bets"
          className={`px-3 py-1.5 rounded-full ${tab === "bets" ? "bg-accent text-white" : "border border-line-strong text-ink-muted"}`}
        >
          ベット履歴
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
          <p className="text-xs text-ink-faint">まだベットはありません。</p>
        ) : (
          <ul className="space-y-2">
            {bets.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/markets/${b.market_id}`}
                  className="flex items-center justify-between rounded-xl border border-line bg-surface p-3 text-sm hover:border-line-strong"
                >
                  <span>
                    {marketHeading(b)} ・ {outcomeLabel(b.outcome_options, b.outcome)}に {formatPoints(b.amount)}
                  </span>
                  <span className="font-mono-num font-semibold">
                    {b.status === "active" && "結果待ち"}
                    {b.status === "won" && <span className="text-accent-ink">的中 +{formatPoints(b.payout_amount)}</span>}
                    {b.status === "lost" && <span className="text-ink-faint">不的中</span>}
                    {b.status === "refunded" && <span className="text-ink-faint">返金済み</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : logs.length === 0 ? (
        <p className="text-xs text-ink-faint">ポイントの動きはまだありません。</p>
      ) : (
        <ul className="space-y-1">
          {logs.map((log) => (
            <li key={log.id} className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2 text-sm">
              <span>
                {ENTRY_LABELS[log.entry_type] ?? log.entry_type}
                <span className="block text-[11px] text-ink-faint">{formatDateTime(log.created_at)}</span>
              </span>
              <span className={`font-mono-num font-bold ${Number(log.points_delta) >= 0 ? "text-accent-ink" : "text-neg"}`}>
                {Number(log.points_delta) >= 0 ? "+" : ""}
                {formatPoints(log.points_delta)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
