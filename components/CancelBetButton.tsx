"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiErrorMessage, isAuthError } from "@/lib/errorMessages";

export default function CancelBetButton({
  betId,
  amount,
  penalty,
}: {
  betId: string;
  amount: number;
  penalty: number;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refund = Math.max(amount - penalty, 0);

  async function cancel() {
    if (
      !confirm(
        `このベット（${amount.toLocaleString("ja-JP")}pt）を取り消します。\n` +
          `ペナルティ ${penalty}pt を差し引いた ${refund.toLocaleString("ja-JP")}pt が返却されます。\nよろしいですか？`
      )
    ) {
      return;
    }

    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/bets/${betId}/cancel`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "unknown" }));
      if (isAuthError(body.error)) {
        router.push("/login");
        return;
      }
      setError(apiErrorMessage(body.error, "取り消せませんでした。"));
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    router.refresh();
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={cancel}
        disabled={submitting}
        className="text-[11px] text-ink-faint underline decoration-dotted disabled:opacity-50"
      >
        {submitting ? "取消中…" : `取り消す（−${penalty}pt）`}
      </button>
      {error && <p className="text-[11px] text-neg mt-0.5">{error}</p>}
    </div>
  );
}
