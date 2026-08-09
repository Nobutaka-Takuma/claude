"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiErrorMessage, readErrorBody } from "@/lib/errorMessages";
import type { VerificationMode, WorkFormField } from "@/lib/types";

// Renders whatever form the task describes in its config, so adding a new
// kind of work is a row in `tasks`, not a new component.
//
// The verification mode has to be visible *before* the user starts. Taking
// someone's twenty minutes of work and then showing "審査中" with no prior
// warning is the fastest way to lose them.
export default function MicroWorkTaskCard({
  taskId,
  fields,
  instructions,
  referenceUrl,
  verificationMode,
  quorumSize,
  disabled,
  disabledReason,
}: {
  taskId: string;
  fields: WorkFormField[];
  instructions?: string | null;
  referenceUrl?: string | null;
  verificationMode: VerificationMode;
  quorumSize: number;
  disabled: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"paid" | "pending" | null>(null);

  const missing = fields
    .filter((f) => f.required)
    .filter((f) => {
      const v = answers[f.id];
      return v === undefined || v === null || String(v).trim() === "" || v === false;
    });

  async function submit() {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/tasks/${taskId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });
    if (!res.ok) {
      const body = await readErrorBody(res);
      setError(apiErrorMessage(body.error, "送信できませんでした。", body.detail));
      setSubmitting(false);
      return;
    }
    const body = (await res.json()) as { paid?: boolean };
    setDone(body.paid ? "paid" : "pending");
    setOpen(false);
    setSubmitting(false);
    router.refresh();
  }

  function setValue(id: string, value: string | boolean) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  if (done) {
    return (
      <p className="text-[11px] font-semibold text-accent-ink border border-line rounded-lg px-3 py-2">
        {done === "paid"
          ? "✅ 提出しました。ポイントを付与しました。"
          : verificationMode === "quorum"
            ? `✅ 提出しました。他の参加者${quorumSize}名のチェックが完了するとポイントが付与されます。`
            : "✅ 提出しました。運営の確認後にポイントが付与されます。"}
      </p>
    );
  }

  if (disabled) {
    return (
      <button
        disabled
        className="text-xs font-semibold text-ink-faint border border-line rounded-lg px-3 py-2 w-full"
      >
        {disabledReason ?? "提出済みです"}
      </button>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-xs font-semibold text-white bg-accent rounded-lg px-3 py-2 hover:opacity-90"
      >
        作業を開始する
      </button>
    );
  }

  return (
    <div className="space-y-3 border border-line-strong rounded-lg p-3 bg-surface-2">
      {instructions && <p className="text-[11px] text-ink-muted whitespace-pre-wrap">{instructions}</p>}
      {referenceUrl && (
        <a
          href={referenceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-[11px] font-semibold text-accent-ink underline"
        >
          作業対象を開く ↗
        </a>
      )}

      {fields.map((f) => (
        <div key={f.id} className="space-y-1">
          <label htmlFor={`${taskId}-${f.id}`} className="block text-xs font-semibold">
            {f.label}
            {f.required && <span className="text-neg ml-1">*</span>}
          </label>
          {f.help && <p className="text-[11px] text-ink-faint">{f.help}</p>}

          {f.type === "textarea" && (
            <textarea
              id={`${taskId}-${f.id}`}
              rows={4}
              placeholder={f.placeholder}
              value={String(answers[f.id] ?? "")}
              onChange={(e) => setValue(f.id, e.target.value)}
              className="w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-xs"
            />
          )}

          {f.type === "select" && (
            <select
              id={`${taskId}-${f.id}`}
              value={String(answers[f.id] ?? "")}
              onChange={(e) => setValue(f.id, e.target.value)}
              className="w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-xs"
            >
              <option value="">選択してください</option>
              {(f.options ?? []).map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          )}

          {f.type === "checkbox" && (
            <label className="flex items-center gap-2 text-xs">
              <input
                id={`${taskId}-${f.id}`}
                type="checkbox"
                checked={answers[f.id] === true}
                onChange={(e) => setValue(f.id, e.target.checked)}
              />
              はい
            </label>
          )}

          {(f.type === "text" || f.type === "url" || f.type === "number") && (
            <input
              id={`${taskId}-${f.id}`}
              type={f.type === "number" ? "number" : f.type === "url" ? "url" : "text"}
              placeholder={f.placeholder}
              value={String(answers[f.id] ?? "")}
              onChange={(e) => setValue(f.id, e.target.value)}
              className="w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-xs"
            />
          )}
        </div>
      ))}

      {error && <p className="text-[11px] text-neg">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={missing.length > 0 || submitting}
          onClick={submit}
          className="flex-1 text-xs font-semibold text-white bg-accent rounded-lg px-3 py-2 disabled:opacity-40"
        >
          {submitting ? "送信中…" : "提出する"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs font-semibold text-ink-muted border border-line-strong rounded-lg px-3 py-2"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}
