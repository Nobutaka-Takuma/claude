"use client";

import { useState } from "react";
import MarketForm, { type MarketFormMode } from "@/components/MarketForm";

export default function MarketFormTabs({
  creationCost,
  creatorFeePct,
  seedAmount,
  approvalThreshold,
  balance,
}: {
  creationCost: number;
  creatorFeePct: number;
  seedAmount: number;
  approvalThreshold: number;
  balance: number;
}) {
  const [mode, setMode] = useState<MarketFormMode>("paid");

  return (
    <div className="rounded-xl border border-line bg-surface p-4 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode("paid")}
          className={`rounded-lg border p-2.5 text-left ${
            mode === "paid" ? "border-gold bg-gold-soft" : "border-line-strong"
          }`}
        >
          <span className="block text-xs font-bold">{creationCost}pt を支払う</span>
          <span className="block text-[10px] text-ink-muted mt-0.5">
            即公開・テラ銭の{creatorFeePct}%を受け取る
          </span>
        </button>
        <button
          type="button"
          onClick={() => setMode("free")}
          className={`rounded-lg border p-2.5 text-left ${
            mode === "free" ? "border-accent bg-accent-soft" : "border-line-strong"
          }`}
        >
          <span className="block text-xs font-bold">無料で提案</span>
          <span className="block text-[10px] text-ink-muted mt-0.5">
            賛成{approvalThreshold}票で公開・報酬なし
          </span>
        </button>
      </div>

      {mode === "paid" && balance < creationCost && (
        <p className="text-[11px] text-neg">
          残高が不足しています（保有 {balance.toLocaleString("ja-JP")}pt）。タスクでポイントを貯めるか、無料提案をご利用ください。
        </p>
      )}

      <MarketForm
        key={mode}
        mode={mode}
        creationCost={creationCost}
        creatorFeePct={creatorFeePct}
        seedAmount={seedAmount}
        approvalThreshold={approvalThreshold}
      />
    </div>
  );
}
