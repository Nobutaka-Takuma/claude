"use client";

import { useState } from "react";
import MarketForm from "./MarketForm";

// Collapsed by default: the admin page is mostly a work queue, and a
// full creation form permanently expanded at the top buries it.
export default function AdminMarketForm({ seedAmount }: { seedAmount: number }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-dashed border-line-strong py-3 text-sm font-semibold text-ink-muted hover:border-accent hover:text-accent-ink"
      >
        ＋ 管理者としてマーケットを作成する
      </button>
    );
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold">管理者としてマーケットを作成</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-ink-faint">
          閉じる
        </button>
      </div>
      <p className="text-[11px] text-ink-muted">
        作成料はかかりません。初期賞金 {seedAmount}pt は金庫が負担するので、公開直後から的中者に配当が出ます。
      </p>
      <MarketForm
        mode="admin"
        creationCost={0}
        creatorFeePct={0}
        seedAmount={seedAmount}
        approvalThreshold={0}
        onCreated={() => setOpen(false)}
      />
    </section>
  );
}
