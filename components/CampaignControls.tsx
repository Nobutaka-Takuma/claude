"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiErrorMessage, readErrorBody } from "@/lib/errorMessages";
import type { CampaignStatus } from "@/lib/types";

// 案件の稼働切り替えと入金記録。
//
// 「止める」が1クリックで届くところにあるのが大事で、広告主から取り下げの
// 連絡が来たときに管理画面を探し回るようだと、その間ずっとユーザーは対価の
// 出ない作業を続けることになる。
export default function CampaignControls({
  campaignId,
  status,
}: {
  campaignId: string;
  status: CampaignStatus;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");

  async function setStatus(next: CampaignStatus) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/campaigns/${campaignId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
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

  async function recordPayment() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value === 0) {
      setError("入金額を入力してください。");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/campaigns/${campaignId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountYen: value }),
    });
    if (!res.ok) {
      const body = await readErrorBody(res);
      setError(apiErrorMessage(body.error, "記録できませんでした。", body.detail));
      setBusy(false);
      return;
    }
    setAmount("");
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {status !== "active" && (
          <button
            type="button"
            onClick={() => setStatus("active")}
            disabled={busy}
            className="text-[11px] font-bold text-white bg-accent rounded-lg px-2.5 py-1 disabled:opacity-50"
          >
            稼働させる
          </button>
        )}
        {status === "active" && (
          <button
            type="button"
            onClick={() => setStatus("paused")}
            disabled={busy}
            className="text-[11px] font-bold border border-neg text-neg rounded-lg px-2.5 py-1 disabled:opacity-50"
          >
            一時停止
          </button>
        )}
        {status !== "finished" && (
          <button
            type="button"
            onClick={() => setStatus("finished")}
            disabled={busy}
            className="text-[11px] font-semibold border border-line-strong text-ink-muted rounded-lg px-2.5 py-1 disabled:opacity-50"
          >
            終了
          </button>
        )}
      </div>

      <div className="flex gap-1.5">
        <input
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="入金額（円）"
          aria-label="入金額（円）"
          className="flex-1 rounded-lg border border-line-strong bg-surface px-2 py-1 text-[11px]"
        />
        <button
          type="button"
          onClick={recordPayment}
          disabled={busy}
          className="text-[11px] font-semibold border border-line-strong rounded-lg px-2.5 py-1 disabled:opacity-50"
        >
          入金を記録
        </button>
      </div>

      {error && <p className="text-[11px] text-neg">{error}</p>}
    </div>
  );
}
