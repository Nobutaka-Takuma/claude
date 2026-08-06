"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiErrorMessage, readErrorBody } from "@/lib/errorMessages";

export default function ModerateMarketButtons({ marketId }: { marketId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"ban" | "dismiss" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "ban" | "dismiss") {
    const confirmText =
      action === "ban"
        ? "このマーケットを停止します。すべての予想が全額返金され、作成者の作成料は没収されます。よろしいですか？"
        : "通報を却下し、このマーケットを通常どおり継続します。ここまでの通報は集計から外れます。よろしいですか？";
    if (!confirm(confirmText)) return;

    setBusy(action);
    setError(null);
    const res = await fetch(`/api/markets/${marketId}/moderate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      const body = await readErrorBody(res);
      setError(apiErrorMessage(body.error, "実行できませんでした。", body.detail));
      setBusy(null);
      return;
    }
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => run("dismiss")}
          disabled={busy !== null}
          className="flex-1 text-[11px] font-semibold border border-line-strong rounded-lg py-1.5 disabled:opacity-50"
        >
          {busy === "dismiss" ? "…" : "通報を却下"}
        </button>
        <button
          type="button"
          onClick={() => run("ban")}
          disabled={busy !== null}
          className="flex-1 text-[11px] font-bold border border-neg text-neg rounded-lg py-1.5 disabled:opacity-50"
        >
          {busy === "ban" ? "…" : "今すぐ停止"}
        </button>
      </div>
      {error && <p className="text-[11px] text-neg">{error}</p>}
    </div>
  );
}
