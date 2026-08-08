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

    const body = await res.json();
    setMessage(
      body.fetched === 0
        ? "取得できた試合が0件でした。リーグの設定（SPORTSDB_LEAGUES）をご確認ください。"
        : `新規${body.created}件・更新${body.updated}件を取り込みました（取得${body.fetched}件）。`
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
        {running ? "取り込み中…" : "⚽ 近日中の試合からマーケットを自動生成する"}
      </button>
      {message && <p className="text-[11px] text-ink-muted">{message}</p>}
    </div>
  );
}
