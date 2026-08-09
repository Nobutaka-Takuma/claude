"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiErrorMessage, readErrorBody } from "@/lib/errorMessages";

export default function TaskActiveToggle({ taskId, isActive }: { taskId: string; isActive: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    if (!res.ok) {
      const body = await readErrorBody(res);
      setError(apiErrorMessage(body.error, "変更できませんでした。", body.detail));
      setBusy(false);
      return;
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={`text-[11px] font-semibold rounded-lg px-2.5 py-1 border disabled:opacity-50 ${
          isActive ? "border-neg text-neg" : "border-line-strong text-ink-muted"
        }`}
      >
        {busy ? "…" : isActive ? "停止する" : "公開する"}
      </button>
      {error && <p className="text-[11px] text-neg">{error}</p>}
    </>
  );
}
