"use client";

import { useState } from "react";
import Link from "next/link";
import MarketForm from "@/components/MarketForm";

export default function CreateMarketFromNews({
  newsArticleId,
  category,
  creationCost,
  creatorFeePct,
  approvalThreshold,
  isLoggedIn,
  balance,
}: {
  newsArticleId: string;
  category: string;
  creationCost: number;
  creatorFeePct: number;
  approvalThreshold: number;
  isLoggedIn: boolean;
  balance: number;
}) {
  const [open, setOpen] = useState(false);

  if (!isLoggedIn) {
    return (
      <p className="text-xs text-ink-muted">
        このニュースでマーケットを作るには
        <Link href="/login" className="text-accent-ink font-semibold mx-1">
          ログイン
        </Link>
        してください。
      </p>
    );
  }

  if (!open) {
    const affordable = balance >= creationCost;
    return (
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={!affordable}
          className="w-full rounded-lg border border-dashed border-line-strong py-2.5 text-xs font-bold text-ink-muted hover:border-accent hover:text-accent-ink disabled:opacity-50"
        >
          ＋ このニュースで予想マーケットを作る（{creationCost}pt）
        </button>
        <p className="text-[10px] text-ink-faint">
          {affordable
            ? `テラ銭の${creatorFeePct}%が作成者のあなたに入ります`
            : `作成には${creationCost}pt必要です（保有 ${balance.toLocaleString("ja-JP")}pt）`}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line-strong bg-surface p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold">このニュースで予想マーケットを作る</span>
        <button type="button" onClick={() => setOpen(false)} className="text-[11px] text-ink-faint">
          閉じる
        </button>
      </div>
      <MarketForm
        mode="paid"
        newsArticleId={newsArticleId}
        defaultCategory={category}
        defaultKind="binary"
        creationCost={creationCost}
        creatorFeePct={creatorFeePct}
        approvalThreshold={approvalThreshold}
        onCreated={() => setOpen(false)}
      />
    </div>
  );
}
