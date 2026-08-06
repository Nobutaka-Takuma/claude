import { getTreasury, getTreasuryBreakdown, getRecentTreasuryLogs } from "@/lib/data";
import { formatDateTime, formatPoints } from "@/lib/format";
import { treasuryLedgerLabel, isRevenueEntry } from "@/lib/ledgerLabels";

export default async function TreasuryPage() {
  const [treasury, breakdown, logs] = await Promise.all([
    getTreasury(),
    getTreasuryBreakdown(),
    getRecentTreasuryLogs(30),
  ]);

  // Bonds and stakes flow through the treasury without belonging to it,
  // and a hand-entered opening balance isn't income at all — counting
  // either one turns the breakdown into a chart of custody.
  const revenue = breakdown.filter((b) => isRevenueEntry(b.entry_type));
  const total = revenue.reduce((sum, b) => sum + Number(b.total), 0);

  // Rows where the treasury itself didn't move (a stake entering a pool,
  // a bond being marked forfeited) are real ledger entries but read as
  // noise here — every one of them shows ±0pt.
  const movements = logs.filter((log) => Number(log.treasury_delta) !== 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-extrabold">コミュニティ金庫</h1>
        <p className="text-xs text-ink-faint mt-1">
          ユーザーの労働（広告視聴・アンケート）が生んだ価値と、マーケットの手数料がここに積み立てられます。
        </p>
      </div>

      <section className="rounded-xl border border-line bg-surface p-4">
        <span className="text-xs font-bold text-ink-muted">現在残高</span>
        <p className="font-mono-num text-3xl font-extrabold text-accent-ink mt-1">
          {formatPoints(treasury.balance)}
        </p>
      </section>

      <section className="rounded-xl border border-line bg-surface p-4 space-y-3">
        <h2 className="text-sm font-bold">収益源の内訳（累計）</h2>
        <p className="text-[11px] text-ink-faint">
          保証金や予想の預かり金は、金庫を通過するだけで収益ではないため含めていません。
        </p>
        {revenue.length === 0 ? (
          <p className="text-xs text-ink-faint">まだ収益はありません。</p>
        ) : (
          <ul className="space-y-2">
            {revenue.map((b) => {
              const pct = total ? Math.round((Number(b.total) / total) * 100) : 0;
              return (
                <li key={b.entry_type} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>{treasuryLedgerLabel(b.entry_type)}</span>
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
          {movements.map((log) => (
            <li key={log.id} className="py-2 flex items-center justify-between text-xs">
              <span className="text-ink-muted">
                {treasuryLedgerLabel(log.entry_type, Number(log.treasury_delta))}
                <span className="block text-[10px] text-ink-faint font-mono-num">
                  {formatDateTime(log.created_at)}
                </span>
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
