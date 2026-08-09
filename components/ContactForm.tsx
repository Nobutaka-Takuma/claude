"use client";

import { useState } from "react";
import { apiErrorMessage, fieldErrorMessage, readErrorBody } from "@/lib/errorMessages";
import { CONTACT_CATEGORIES } from "@/lib/contactCategories";

export default function ContactForm({
  defaultName,
  defaultEmail,
}: {
  defaultName?: string;
  defaultEmail?: string;
}) {
  const [name, setName] = useState(defaultName ?? "");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [category, setCategory] = useState<string>("account");
  const [body, setBody] = useState("");
  const [website, setWebsite] = useState(""); // ハニーポット
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div className="rounded-xl border border-accent/50 bg-accent/5 p-4 space-y-1">
        <p className="text-sm font-bold text-accent-ink">送信しました</p>
        <p className="text-xs text-ink-muted">
          内容を確認のうえ、ご記入いただいたメールアドレス宛にご返信します。
          返信までお時間をいただく場合があります。
        </p>
      </div>
    );
  }

  const inputClass = "w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm";
  const labelClass = "block text-xs font-semibold mb-1";

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, category, body, website }),
        });
        if (!res.ok) {
          const parsed = await readErrorBody(res);
          setError(
            fieldErrorMessage(parsed.fields) ??
              apiErrorMessage(parsed.error, "送信できませんでした。", parsed.detail)
          );
          setBusy(false);
          return;
        }
        setBusy(false);
        setSent(true);
      }}
    >
      <div>
        <label className={labelClass} htmlFor="contact-name">
          お名前 / ユーザー名
        </label>
        <input
          id="contact-name"
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={80}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="contact-email">
          返信先メールアドレス
        </label>
        <input
          id="contact-email"
          type="email"
          className={inputClass}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          maxLength={200}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="contact-category">
          お問い合わせの種類
        </label>
        <select
          id="contact-category"
          className={inputClass}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {CONTACT_CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass} htmlFor="contact-body">
          お問い合わせ内容
        </label>
        <textarea
          id="contact-body"
          rows={8}
          className={inputClass}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          minLength={10}
          maxLength={4000}
          placeholder="できるだけ具体的にご記入ください。マーケットやタスクについてのご連絡は、該当するページのURLを添えていただけると確認が早くなります。"
        />
        <p className="text-[11px] text-ink-faint mt-1">{body.length} / 4000文字</p>
      </div>

      {/* 人間には見えない欄。自動投稿だけがここを埋める。 */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="contact-website">Website</label>
        <input
          id="contact-website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      {error && <p className="text-xs text-neg">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="w-full text-sm font-semibold text-white bg-accent rounded-lg px-3 py-2.5 disabled:opacity-40"
      >
        {busy ? "送信中…" : "送信する"}
      </button>
    </form>
  );
}
