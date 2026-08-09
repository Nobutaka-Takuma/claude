"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiErrorMessage, readErrorBody } from "@/lib/errorMessages";

// The operator's承認/却下 pair on the admin review queue. A rejection asks
// for a reason: the worker sees it on /tasks, and "却下" with no reason is
// how you get the same wrong submission again from the same person.
export default function ReviewCompletionButtons({ completionId }: { completionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"ok" | "ng" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(approve: boolean) {
    let note: string | null = null;
    if (!approve) {
      note = prompt("却下の理由を入力してください（提出者に表示されます）");
      if (note === null) return;
    }
    setBusy(approve ? "ok" : "ng");
    setError(null);
    const res = await fetch(`/api/completions/${completionId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve, note: note ?? undefined }),
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
          onClick={() => run(true)}
          disabled={busy !== null}
          className="flex-1 text-[11px] font-bold text-white bg-accent rounded-lg py-1.5 disabled:opacity-50"
        >
          {busy === "ok" ? "…" : "承認して支払う"}
        </button>
        <button
          type="button"
          onClick={() => run(false)}
          disabled={busy !== null}
          className="flex-1 text-[11px] font-bold border border-neg text-neg rounded-lg py-1.5 disabled:opacity-50"
        >
          {busy === "ng" ? "…" : "却下"}
        </button>
      </div>
      {error && <p className="text-[11px] text-neg">{error}</p>}
    </div>
  );
}
