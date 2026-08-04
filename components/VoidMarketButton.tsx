"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function VoidMarketButton({ marketId }: { marketId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function voidMarket() {
    if (!confirm("この試合を中止し、全ベットを全額返金します。よろしいですか？")) return;
    setSubmitting(true);
    const res = await fetch(`/api/markets/${marketId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome: "void" }),
    });
    setSubmitting(false);
    if (res.ok) router.refresh();
  }

  return (
    <button
      type="button"
      disabled={submitting}
      onClick={voidMarket}
      className="text-[11px] font-semibold text-ink-faint underline decoration-dotted disabled:opacity-50"
    >
      {submitting ? "処理中…" : "試合を中止して全額返金する"}
    </button>
  );
}
