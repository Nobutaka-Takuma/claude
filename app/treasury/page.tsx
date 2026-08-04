import { getTreasury, getTreasuryBreakdown, getRecentTreasuryLogs } from "@/lib/data";
import { formatDateTime, formatPoints } from "@/lib/format";

const ENTRY_LABELS: Record<string, string> = {
  task_reward: "労働報酬（広告視聴・アンケート）",
  rake_collected: "テラ銭（マーケット手数料）",
  treasury_grant: "運営付与（支出）",
  adjustment: "補正",
};

export default async function TreasuryPage() {
  const [treasury, breakdown, logs] = await Promise.all([
    getTreasury(),
    getTreasuryBreakdown(),
    getRecentTreasuryLogs(30),
  ]);

  const total = breakdown.reduce((sum, b) => sum + Number(b.total), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-extrabold">コミュニティ金庫（Treasury）</h1>
        <p className="text-xs text-ink-faint mt-1">
          ユーザーの労働（広告視聴・アンケート）が生んだ価値と、マーケットのテラ銭がここに積み立てられます。
        </p>
      </div>

      <section className="rounded-xl border border-line bg-surface p-4">
        <span className="text-xs font-bold text-ink-muted">現在残高</span>
        <p className="font-mono-num text-3xl font-extrabold text-accent-ink mt-1">
          {formatPoints(treasury.balance)}
        </p>
      </section>

      <section className="rounded-xl border border-line bg-surface p-4 space-y-3">
        <h2 className="text-sm font-bold">収益源の内訳（累計流入）</h2>
        {breakdown.length === 0 ? (
          <p className="text-xs text-ink-faint">まだ収益はありません。</p>
        ) : (
          <ul className="space-y-2">
            {breakdown.map((b) => {
              const pct = total ? Math.round((Number(b.total) / total) * 100) : 0;
              return (
                <li key={b.entry_type} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>{ENTRY_LABELS[b.entry_type] ?? b.entry_type}</span>
                    <span className="font-mono-num font-semibold">{pct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                    <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-line bg-surface p-4 space-y-2">
        <h2 className="text-sm font-bold">直近のログ</h2>
        <ul className="divide-y divide-line">
          {logs.map((log) => (
            <li key={log.id} className="py-2 flex items-center justify-between text-xs">
              <span className="text-ink-muted">
                {log.entry_type}
                <span className="block text-[10px] text-ink-faint font-mono-num">{formatDateTime(log.created_at)}</span>
              </span>
              <span className={`font-mono-num font-bold ${Number(log.treasury_delta) >= 0 ? "text-accent-ink" : "text-neg"}`}>
                {Number(log.treasury_delta) >= 0 ? "+" : ""}
                {formatPoints(log.treasury_delta)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
