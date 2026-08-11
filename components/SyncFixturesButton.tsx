"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiErrorMessage, readErrorBody } from "@/lib/errorMessages";

// Lets an admin populate the board without waiting for the daily cron —
// useful right after configuring leagues, when the whole question is
// whether the settings are right.
export default function SyncFixturesButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function sync() {
    setRunning(true);
    setMessage(null);
    const res = await fetch("/api/cron/sync-fixtures", { method: "POST" });
    setRunning(false);

    if (!res.ok) {
      const body = await readErrorBody(res);
      setMessage(apiErrorMessage(body.error, "試合の取り込みに失敗しました。", body.detail));
      return;
    }

    const body = (await res.json()) as {
      fetched?: number;
      created?: number;
      updated?: number;
      truncated?: number;
      daysAhead?: number;
    };

    if (!body.fetched) {
      setMessage(
        `今後${body.daysAhead ?? "?"}日以内に予定されている試合が0件でした。` +
          "リーグの設定（SPORTSDB_LEAGUES）と、そのリーグが今シーズン中かをご確認ください。"
      );
      router.refresh();
      return;
    }

    // 「取得」と「新規」を並べて出す。作られた数だけだと、少なかったときに
    // 取得できていないのか既にあるのかが区別できない。
    const parts = [
      `今後${body.daysAhead}日以内の試合を${body.fetched}件取得`,
      `新規${body.created}件・更新${body.updated}件`,
    ];
    if (body.truncated) {
      parts.push(`※1回あたりの上限のため${body.truncated}件は次回に持ち越し`);
    }
    setMessage(`${parts.join(" → ")}。`);
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
        {running ? "取り込み中…" : "⚽ 近日中の試合からマーケットを自動生成する"}
      </button>
      {message && <p className="text-[11px] text-ink-muted">{message}</p>}
    </div>
  );
}
