"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ERROR_MESSAGES: Record<string, string> = {
  email_taken: "このメールアドレスは既に登録されています",
  username_taken: "このユーザー名は既に使われています",
  invalid_credentials: "メールアドレスまたはパスワードが違います",
  invalid_input: "入力内容を確認してください（パスワードは8文字以上）",
};

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode === "signup" ? { email, password, username } : { email, password }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "unknown" }));
      setError(ERROR_MESSAGES[body.error] ?? "エラーが発生しました。もう一度お試しください");
      setSubmitting(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-sm mx-auto">
      <h1 className="text-xl font-bold">{mode === "signup" ? "新規登録" : "ログイン"}</h1>

      {mode === "signup" && (
        <label className="block space-y-1">
          <span className="text-sm text-ink-muted">ユーザー名</span>
          <input
            required
            minLength={2}
            maxLength={24}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm"
          />
        </label>
      )}

      <label className="block space-y-1">
        <span className="text-sm text-ink-muted">メールアドレス</span>
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm text-ink-muted">パスワード{mode === "signup" && "（8文字以上）"}</span>
        <input
          required
          type="password"
          minLength={mode === "signup" ? 8 : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm"
        />
      </label>

      {error && <p className="text-sm text-neg">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-accent text-white font-semibold py-2.5 hover:opacity-90 disabled:opacity-50"
      >
        {mode === "signup" ? "登録する" : "ログイン"}
      </button>
    </form>
  );
}
