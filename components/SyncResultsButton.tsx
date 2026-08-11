"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiErrorMessage, readErrorBody } from "@/lib/errorMessages";

// 終了した試合の結果を今すぐ取り込む。日次のcronでも走るので、これは
// 「待たずに確認したい」ときのためのもの。
export default function SyncResultsButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function sync() {
    setRunning(true);
    setMessage(null);
    const res = await fetch("/api/cron/sync-results", { method: "POST" });
    setRunning(false);

    if (!res.ok) {
      const body = await readErrorBody(res);
      setMessage(apiErrorMessage(body.error, "結果の取り込みに失敗しました。", body.detail));
      return;
    }

    const body = (await res.json()) as {
      checked?: number;
      submitted?: number;
      stillPending?: number;
      failed?: number;
      disputeWindowMinutes?: number;
    };

    if (!body.checked) {
      setMessage("結果待ちのマーケットがありません（キックオフを過ぎたものが対象です）。");
      router.refresh();
      return;
    }

    const parts = [`結果待ち${body.checked}件を確認`, `${body.submitted}件の結果を報告`];
    if (body.stillPending) parts.push(`${body.stillPending}件はまだ試合中／未確定`);
    if (body.failed) parts.push(`${body.failed}件は取得に失敗`);
    setMessage(
      `${parts.join(" ・ ")}。報告した結果は${(body.disputeWindowMinutes ?? 1440) / 60}時間の異議申し立て期間のあと自動で精算されます。`
    );
    router.refresh();
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={sync}
        disabled={running}
        className="w-full rounded-xl border border-dashed border-line-strong py-3 text-sm font-semibold text-ink-muted hover:border-accent hover:text-accent-ink disabled:opacity-50"
      >
        {running ? "取り込み中…" : "🏁 終了した試合の結果を取り込む"}
      </button>
      {message && <p className="text-[11px] text-ink-muted">{message}</p>}
    </div>
  );
}
