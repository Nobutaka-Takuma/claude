"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiErrorMessage, readErrorBody } from "@/lib/errorMessages";

// One submission, shown to somebody other than its author, with the two
// buttons that decide whether it gets paid.
//
// The submitted answers are rendered as plain text, never as HTML or a
// link — a peer-reviewed field is arbitrary text from another user, and the
// reviewer is the one person guaranteed to look at it.
export default function PeerReviewCard({
  completionId,
  taskTitle,
  username,
  answers,
  approvals,
  rejections,
  quorumSize,
  reviewRewardPoints,
}: {
  completionId: string;
  taskTitle: string;
  username: string;
  answers: Record<string, unknown>;
  approvals: number;
  rejections: number;
  quorumSize: number;
  // What the *reviewer* earns for looking, not what the submitter earns —
  // this card belongs to the reviewer, and showing the submitter's reward
  // here would read as a promise to the wrong person.
  reviewRewardPoints: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"ok" | "ng" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);

  async function vote(approve: boolean) {
    setBusy(approve ? "ok" : "ng");
    setError(null);
    const res = await fetch(`/api/completions/${completionId}/peer-review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve }),
    });
    if (!res.ok) {
      const body = await readErrorBody(res);
      setError(apiErrorMessage(body.error, "送信できませんでした。", body.detail));
      setBusy(null);
      return;
    }
    setHidden(true);
    router.refresh();
  }

  if (hidden) return null;

  const entries = Object.entries(answers);

  return (
    <div className="rounded-xl border border-line bg-surface p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{taskTitle}</span>
        <span className="font-mono-num text-xs font-bold text-accent-ink">
          チェックで +{reviewRewardPoints}pt
        </span>
      </div>
      <p className="text-[11px] text-ink-faint">
        提出者 {username} ・ OK {approvals}/{quorumSize}
        {rejections > 0 && ` ・ NG ${rejections}/${quorumSize}`}
      </p>

      <dl className="space-y-1 rounded-lg bg-surface-2 p-2">
        {entries.length === 0 && <p className="text-[11px] text-ink-faint">提出内容がありません。</p>}
        {entries.map(([key, value]) => (
          <div key={key} className="text-[11px]">
            <dt className="text-ink-faint">{key}</dt>
            <dd className="text-ink whitespace-pre-wrap break-words">{String(value)}</dd>
          </div>
        ))}
      </dl>

      {error && <p className="text-[11px] text-neg">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => vote(true)}
          disabled={busy !== null}
          className="flex-1 text-[11px] font-bold text-white bg-accent rounded-lg py-1.5 disabled:opacity-50"
        >
          {busy === "ok" ? "…" : "OK（基準を満たす）"}
        </button>
        <button
          type="button"
          onClick={() => vote(false)}
          disabled={busy !== null}
          className="flex-1 text-[11px] font-bold border border-neg text-neg rounded-lg py-1.5 disabled:opacity-50"
        >
          {busy === "ng" ? "…" : "NG（やり直し）"}
        </button>
      </div>
    </div>
  );
}
