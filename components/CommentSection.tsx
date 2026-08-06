"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiErrorMessage } from "@/lib/errorMessages";
import { formatDateTime } from "@/lib/format";
import type { Comment } from "@/lib/types";

export default function CommentSection({
  newsArticleId,
  comments,
  canPost,
}: {
  newsArticleId: string;
  comments: Comment[];
  canPost: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/news/${newsArticleId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "unknown" }));
      setError(apiErrorMessage(body.error, "コメントを送信できませんでした。", body.detail));
      setSubmitting(false);
      return;
    }

    setBody("");
    setSubmitting(false);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-bold text-ink-muted"
      >
        💬 みんなの議論（{comments.length}件のコメント）{open ? " ▲" : " ▼"}
      </button>

      {open && (
        <div className="space-y-3">
          {comments.length === 0 ? (
            <p className="text-xs text-ink-faint">まだコメントはありません。最初の一人になりましょう。</p>
          ) : (
            <ul className="space-y-2">
              {comments.map((c) => (
                <li key={c.id} className="text-xs bg-surface-2 rounded-lg px-3 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-bold">{c.username}</span>
                    <span className="text-[10px] text-ink-faint">{formatDateTime(c.created_at)}</span>
                  </div>
                  <p className="text-ink-muted mt-0.5 whitespace-pre-wrap">{c.body}</p>
                </li>
              ))}
            </ul>
          )}

          {canPost ? (
            <form onSubmit={submit} className="flex gap-2">
              <input
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="コメントを書く…"
                maxLength={2000}
                className="flex-1 rounded-lg border border-line-strong bg-surface px-3 py-2 text-xs"
              />
              <button
                type="submit"
                disabled={submitting || !body.trim()}
                className="text-xs font-bold text-white bg-accent rounded-lg px-3 py-2 disabled:opacity-40"
              >
                投稿
              </button>
            </form>
          ) : (
            <p className="text-[11px] text-ink-faint">コメントするにはログインしてください。</p>
          )}
          {error && <p className="text-[11px] text-neg">{error}</p>}
        </div>
      )}
    </div>
  );
}
