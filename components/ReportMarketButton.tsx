"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { REPORT_CATEGORIES } from "@/lib/reportCategories";
import { apiErrorMessage, isAuthError, readErrorBody, fieldErrorMessage } from "@/lib/errorMessages";

// Deliberately low-key until opened: a prominent report button on every
// market invites idle clicking, and the reward means idle clicking has a
// cost to somebody. Once opened it states plainly what happens, because a
// report is a vote to destroy a market, not a complaint form.
export default function ReportMarketButton({
  marketId,
  threshold,
  currentCount,
  reward,
  alreadyReported,
}: {
  marketId: string;
  threshold: number;
  currentCount: number;
  reward: number;
  alreadyReported: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(REPORT_CATEGORIES[0].key);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remaining = Math.max(threshold - currentCount, 0);
  const selected = REPORT_CATEGORIES.find((c) => c.key === category);

  async function submit() {
    if (
      !confirm(
        `このマーケットを「${selected?.label}」として通報します。\n\n` +
          `・通報が${threshold}件に達すると、このマーケットは停止され、すべての予想が全額返金されます\n` +
          `・作成者が支払った作成料は返金されません\n` +
          `・停止された場合、通報した人には${reward}ptが支払われます\n\n` +
          `根拠のない通報は他の人の予想を無効にしてしまいます。よろしいですか？`
      )
    ) {
      return;
    }

    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/markets/${marketId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, note: note.trim() || undefined }),
    });

    if (!res.ok) {
      const body = await readErrorBody(res);
      if (isAuthError(body.error)) {
        router.push("/login");
        return;
      }
      setError(
        fieldErrorMessage(body.fields) ??
          apiErrorMessage(body.error, "通報できませんでした。", body.detail)
      );
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setOpen(false);
    router.refresh();
  }

  if (alreadyReported) {
    return (
      <p className="text-[11px] text-ink-faint text-center">
        このマーケットを通報済みです（現在 {currentCount}/{threshold} 件）。
      </p>
    );
  }

  if (!open) {
    return (
      <div className="text-center space-y-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-[11px] text-ink-faint underline hover:text-neg"
        >
          🚩 このマーケットを通報する
        </button>
        {currentCount > 0 && (
          <p className="text-[11px] text-neg">
            通報 {currentCount}/{threshold} 件 — あと{remaining}件で停止されます
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-neg/40 bg-neg/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-neg">このマーケットを通報する</span>
        <button type="button" onClick={() => setOpen(false)} className="text-[11px] text-ink-faint">
          閉じる
        </button>
      </div>

      <p className="text-[11px] text-ink-muted">
        通報が{threshold}件に達すると、このマーケットは停止され、すべての予想が全額返金されます。
        作成者の作成料は返金されず、通報した人には{reward}ptが支払われます。
        {currentCount > 0 && (
          <span className="block font-bold text-neg mt-0.5">
            現在 {currentCount}/{threshold} 件
          </span>
        )}
      </p>

      <label className="block space-y-1">
        <span className="text-[11px] text-ink-muted">理由</span>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm"
        >
          {REPORT_CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        {selected && <span className="block text-[11px] text-ink-faint">{selected.description}</span>}
      </label>

      <label className="block space-y-1">
        <span className="text-[11px] text-ink-muted">補足（任意）</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="どこが問題か具体的に書いていただけると、運営の確認が早くなります。"
          className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm"
        />
      </label>

      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className="w-full rounded-lg border border-neg text-neg text-xs font-bold py-2 disabled:opacity-50"
      >
        {submitting ? "送信中…" : "通報する"}
      </button>
      {error && <p className="text-[11px] text-neg">{error}</p>}
    </div>
  );
}
