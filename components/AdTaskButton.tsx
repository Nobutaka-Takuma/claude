"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiErrorMessage, readErrorBody } from "@/lib/errorMessages";

// 動画リワード広告のモック。
//
// 実際の広告SDKは全画面のオーバーレイを出し、規定秒数はスキップさせず、
// 再生完了後に報酬を確定させる。ここではその「形」だけを再現している —
// 動画の中身はないが、画面の占有・カウントダウン・閉じてから付与、という
// 順序は本物と同じにしてある。差し替えるときに変わるのは start() の中で
// SDKを呼ぶかどうかだけで、前後のUIはそのまま使える。
//
// 本番では報酬の確定を、この画面からのfetchではなく広告ネットワークの
// SSVコールバック（app/api/webhooks/ad-reward）で行う。クライアントの
// 「見終わりました」を信じて付与すると、リクエストを直接叩くだけで
// ポイントが増えるため。
const WATCH_SECONDS = 3;

type Phase = "idle" | "playing" | "submitting" | "done" | "error";

export default function AdTaskButton({
  taskId,
  rewardPoints,
  disabled,
  disabledReason,
}: {
  taskId: string;
  rewardPoints?: number;
  disabled: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [secondsLeft, setSecondsLeft] = useState(WATCH_SECONDS);
  const [error, setError] = useState<string | null>(null);

  // 再生ごとに増える通し番号。カウントダウンの途中で画面を離れたとき、
  // 残ったタイマーが消えたモーダルに対して setState するのを防ぐ。
  const runId = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // 広告が全画面を覆っている間は背後のページをスクロールさせない。
  useEffect(() => {
    if (phase === "idle" || phase === "error") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [phase]);

  async function start() {
    const myRun = ++runId.current;
    const alive = () => mounted.current && runId.current === myRun;

    setError(null);
    setSecondsLeft(WATCH_SECONDS);
    setPhase("playing");

    for (let s = WATCH_SECONDS; s > 0; s--) {
      await new Promise((r) => setTimeout(r, 1000));
      if (!alive()) return;
      setSecondsLeft(s - 1);
    }

    setPhase("submitting");
    const res = await fetch(`/api/tasks/${taskId}/complete`, { method: "POST" });
    if (!alive()) return;

    if (!res.ok) {
      const body = await readErrorBody(res);
      if (!alive()) return;
      setError(
        body.error === "limit_reached" || body.error === "completion_limit_reached"
          ? "視聴回数の上限に達しています"
          : apiErrorMessage(body.error, "エラーが発生しました。", body.detail)
      );
      setPhase("error");
      return;
    }
    setPhase("done");
    router.refresh();
  }

  if (disabled) {
    return (
      <button
        disabled
        className="w-full text-xs font-semibold text-ink-faint border border-line rounded-lg px-3 py-2"
      >
        {disabledReason ?? "視聴回数の上限に達しました"}
      </button>
    );
  }

  const overlayOpen = phase === "playing" || phase === "submitting" || phase === "done";

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={start}
        className="w-full text-xs font-semibold text-white bg-accent rounded-lg px-3 py-2 hover:opacity-90"
      >
        視聴する
      </button>
      {error && <p className="text-[11px] text-neg">{error}</p>}

      {overlayOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="広告"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        >
          <div className="w-full max-w-sm rounded-2xl bg-surface overflow-hidden shadow-2xl">
            {/* 広告の枠。実物の動画プレイヤーが入る場所。 */}
            <div className="relative aspect-video bg-gradient-to-br from-slate-800 to-slate-950 flex flex-col items-center justify-center gap-2">
              <span className="absolute top-2 left-2 text-[10px] font-bold text-white/70 border border-white/30 rounded px-1.5 py-0.5">
                広告
              </span>
              {phase === "playing" && (
                <>
                  <span className="text-4xl" aria-hidden="true">
                    🎬
                  </span>
                  <p className="text-xs text-white/80">サンプル広告を再生中</p>
                  <p className="font-mono-num text-3xl font-bold text-white tabular-nums">
                    {secondsLeft}
                  </p>
                </>
              )}
              {phase === "submitting" && <p className="text-xs text-white/80">ポイントを付与中…</p>}
              {phase === "done" && (
                <>
                  <span className="text-4xl" aria-hidden="true">
                    🎉
                  </span>
                  <p className="font-mono-num text-2xl font-bold text-gold">
                    +{rewardPoints ?? 0}pt
                  </p>
                </>
              )}
            </div>

            <div className="p-4 space-y-2">
              {phase === "playing" && (
                <p className="text-[11px] text-ink-faint text-center">
                  再生が終わるまで閉じられません（あと{secondsLeft}秒）
                </p>
              )}
              {phase === "done" && (
                <p className="text-xs text-center font-semibold">ポイントを付与しました</p>
              )}
              <button
                type="button"
                disabled={phase !== "done"}
                onClick={() => setPhase("idle")}
                className="w-full text-sm font-semibold text-white bg-accent rounded-lg px-3 py-2.5 disabled:opacity-30"
              >
                {phase === "done" ? "閉じる" : "×"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
