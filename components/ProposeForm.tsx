"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ProposeForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const [kickoffTime, setKickoffTime] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/markets/propose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, homeTeam, awayTeam, kickoffTime, description }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "unknown" }));
      setError(body.error === "kickoff_must_be_future" ? "キックオフ日時は未来にしてください" : "提案に失敗しました");
      setSubmitting(false);
      return;
    }

    setTitle("");
    setHomeTeam("");
    setAwayTeam("");
    setKickoffTime("");
    setDescription("");
    setSubmitting(false);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <label className="block space-y-1">
        <span className="text-xs text-ink-muted">試合名</span>
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例: 浦和レッズ vs FC東京"
          className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1">
          <span className="text-xs text-ink-muted">ホームチーム</span>
          <input
            required
            value={homeTeam}
            onChange={(e) => setHomeTeam(e.target.value)}
            className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-ink-muted">アウェイチーム</span>
          <input
            required
            value={awayTeam}
            onChange={(e) => setAwayTeam(e.target.value)}
            className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm"
          />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-xs text-ink-muted">キックオフ日時</span>
        <input
          required
          type="datetime-local"
          value={kickoffTime}
          onChange={(e) => setKickoffTime(e.target.value)}
          className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-ink-muted">説明（任意）</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm"
        />
      </label>
      {error && <p className="text-xs text-neg">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-accent text-white font-semibold py-2.5 disabled:opacity-50"
      >
        {submitting ? "送信中…" : "提案を投稿"}
      </button>
    </form>
  );
}
