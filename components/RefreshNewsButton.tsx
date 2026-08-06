"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RefreshNewsButton() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "running">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    setState("running");
    setMessage(null);
    const res = await fetch("/api/news/sync", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setState("idle");

    if (!res.ok) {
      setMessage("更新に失敗しました。フィードの設定を確認してください。");
      return;
    }

    const failed = body.failedFeeds?.length ?? 0;
    setMessage(
      `新着${body.created}件・更新${body.updated}件` + (failed > 0 ? `（${failed}件のフィードが取得失敗）` : "")
    );
    router.refresh();
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={refresh}
        disabled={state === "running"}
        className="text-[11px] font-semibold text-accent-ink border border-line-strong rounded-full px-3 py-1 disabled:opacity-50"
      >
        {state === "running" ? "更新中…" : "🔄 ニュースを更新"}
      </button>
      {message && <p className="text-[10px] text-ink-faint mt-1">{message}</p>}
    </div>
  );
}
