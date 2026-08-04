"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RaiseChallengeForm({ marketId }: { marketId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-xs font-semibold text-neg border border-neg rounded-lg px-3 py-2"
      >
        異議を申し立てる
      </button>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/markets/${marketId}/challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, evidenceUrl }),
    });
    if (!res.ok) {
      setError("送信できませんでした");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-2 border border-neg/40 rounded-lg p-3">
      <label className="block space-y-1">
        <span className="text-xs text-ink-muted">異議の理由</span>
        <textarea
          required
          minLength={5}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm"
          rows={3}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-ink-muted">証拠URL（任意）</span>
        <input
          type="url"
          value={evidenceUrl}
          onChange={(e) => setEvidenceUrl(e.target.value)}
          className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm"
          placeholder="https://"
        />
      </label>
      {error && <p className="text-xs text-neg">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full text-xs font-bold text-white bg-neg rounded-lg px-3 py-2 disabled:opacity-50"
      >
        {submitting ? "送信中…" : "異議を送信してDAO投票を開始"}
      </button>
    </form>
  );
}
