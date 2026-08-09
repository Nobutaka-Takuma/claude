"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiErrorMessage, readErrorBody } from "@/lib/errorMessages";

export default function ContactStatusButtons({
  messageId,
  status,
}: {
  messageId: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(next: "in_progress" | "closed", askNote: boolean) {
    let note: string | undefined;
    if (askNote) {
      const input = prompt("対応メモ（任意・利用者には表示されません）");
      if (input === null) return;
      note = input || undefined;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/contact/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next, note }),
    });
    if (!res.ok) {
      const body = await readErrorBody(res);
      setError(apiErrorMessage(body.error, "更新できませんでした。", body.detail));
      setBusy(false);
      return;
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        {status !== "in_progress" && (
          <button
            type="button"
            onClick={() => setStatus("in_progress", false)}
            disabled={busy}
            className="flex-1 text-[11px] font-semibold border border-line-strong rounded-lg py-1.5 disabled:opacity-50"
          >
            対応中にする
          </button>
        )}
        <button
          type="button"
          onClick={() => setStatus("closed", true)}
          disabled={busy}
          className="flex-1 text-[11px] font-bold text-white bg-accent rounded-lg py-1.5 disabled:opacity-50"
        >
          対応済みにする
        </button>
      </div>
      {error && <p className="text-[11px] text-neg">{error}</p>}
    </div>
  );
}
