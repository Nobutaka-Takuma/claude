"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiErrorMessage } from "@/lib/errorMessages";

interface Question {
  id: string;
  label: string;
  options: string[];
}

export default function SurveyTaskCard({
  taskId,
  questions,
  disabled,
  disabledReason,
}: {
  taskId: string;
  questions: Question[];
  disabled: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allAnswered = questions.every((q) => answers[q.id]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "unknown" }));
      setError(apiErrorMessage(body.error, "送信できませんでした。", body.detail));
      setSubmitting(false);
      return;
    }
    setOpen(false);
    setSubmitting(false);
    router.refresh();
  }

  if (disabled) {
    return (
      <button disabled className="text-xs font-semibold text-ink-faint border border-line rounded-lg px-3 py-2 w-full">
        {disabledReason ?? "回答済みです"}
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
        回答する
      </button>
    );
  }

  return (
    <div className="space-y-3 border border-line-strong rounded-lg p-3 bg-surface-2">
      {questions.map((q) => (
        <fieldset key={q.id} className="space-y-1">
          <legend className="text-xs font-semibold">{q.label}</legend>
          <div className="flex flex-wrap gap-2">
            {q.options.map((opt) => (
              <label
                key={opt}
                className={`text-[11px] px-2.5 py-1 rounded-full border cursor-pointer ${
                  answers[q.id] === opt
                    ? "bg-accent text-white border-accent"
                    : "border-line-strong text-ink-muted"
                }`}
              >
                <input
                  type="radio"
                  name={q.id}
                  value={opt}
                  className="sr-only"
                  checked={answers[q.id] === opt}
                  onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                />
                {opt}
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      {error && <p className="text-[11px] text-neg">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!allAnswered || submitting}
          onClick={submit}
          className="flex-1 text-xs font-semibold text-white bg-accent rounded-lg px-3 py-2 disabled:opacity-40"
        >
          {submitting ? "送信中…" : "回答を送信"}
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
