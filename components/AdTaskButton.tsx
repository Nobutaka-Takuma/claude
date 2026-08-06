"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiErrorMessage } from "@/lib/errorMessages";

const WATCH_SECONDS = 3;

export default function AdTaskButton({
  taskId,
  disabled,
  disabledReason,
}: {
  taskId: string;
  disabled: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "playing" | "submitting" | "error">("idle");
  const [secondsLeft, setSecondsLeft] = useState(WATCH_SECONDS);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setError(null);
    setPhase("playing");
    setSecondsLeft(WATCH_SECONDS);

    for (let s = WATCH_SECONDS; s > 0; s--) {
      setSecondsLeft(s);
      await new Promise((r) => setTimeout(r, 1000));
    }

    setPhase("submitting");
    const res = await fetch(`/api/tasks/${taskId}/complete`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "unknown" }));
      setError(
        body.error === "limit_reached" || body.error === "completion_limit_reached"
          ? "本日の視聴上限に達しています"
          : apiErrorMessage(body.error, "エラーが発生しました。", body.detail)
      );
      setPhase("error");
      return;
    }
    setPhase("idle");
    router.refresh();
  }

  if (disabled) {
    return (
      <button disabled className="wf-btn-disabled text-xs font-semibold text-ink-faint border border-line rounded-lg px-3 py-2">
        {disabledReason ?? "本日の上限に達しました"}
      </button>
    );
  }

  if (phase === "playing") {
    return (
      <div className="text-xs font-mono-num font-semibold text-accent-ink border border-accent-soft bg-accent-soft rounded-lg px-3 py-2 text-center">
        ▶ 広告を再生中… {secondsLeft}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={start}
        disabled={phase === "submitting"}
        className="w-full text-xs font-semibold text-white bg-accent rounded-lg px-3 py-2 hover:opacity-90 disabled:opacity-50"
      >
        {phase === "submitting" ? "処理中…" : "視聴する"}
      </button>
      {error && <p className="text-[11px] text-neg">{error}</p>}
    </div>
  );
}
