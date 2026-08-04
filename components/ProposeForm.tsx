"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type MarketKind = "match_winner" | "binary" | "multi_outcome";

const KIND_OPTIONS: { kind: MarketKind; label: string; hint: string }[] = [
  { kind: "match_winner", label: "試合の勝敗", hint: "ホーム/引分/アウェイの3択" },
  { kind: "binary", label: "Yes / No質問", hint: "例: 特定の選手がスタメンで出るか" },
  { kind: "multi_outcome", label: "複数選択肢", hint: "自由に選択肢を追加（2〜8個）" },
];

const ERROR_MESSAGES: Record<string, string> = {
  kickoff_must_be_future: "キックオフ／締切日時は未来にしてください",
  home_away_required: "ホーム・アウェイチームを入力してください",
  invalid_outcome_options: "選択肢は2〜8個で入力してください",
  duplicate_outcome_keys: "選択肢が重複しています",
  invalid_outcome_key: "選択肢を空欄にしないでください",
};

export default function ProposeForm() {
  const router = useRouter();
  const [marketKind, setMarketKind] = useState<MarketKind>("match_winner");
  const [title, setTitle] = useState("");
  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const [kickoffTime, setKickoffTime] = useState("");
  const [description, setDescription] = useState("");
  const [customOptions, setCustomOptions] = useState(["", ""]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateOption(i: number, value: string) {
    setCustomOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const outcomeOptions =
      marketKind === "binary"
        ? [
            { key: "yes", label: "はい" },
            { key: "no", label: "いいえ" },
          ]
        : marketKind === "multi_outcome"
          ? customOptions
              .map((label, i) => ({ key: `opt${i + 1}`, label: label.trim() }))
              .filter((o) => o.label.length > 0)
          : [];

    const res = await fetch("/api/markets/propose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        marketKind,
        kickoffTime,
        description,
        homeTeam: marketKind === "match_winner" ? homeTeam : undefined,
        awayTeam: marketKind === "match_winner" ? awayTeam : undefined,
        outcomeOptions: marketKind === "match_winner" ? undefined : outcomeOptions,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "unknown" }));
      setError(ERROR_MESSAGES[body.error] ?? "提案に失敗しました");
      setSubmitting(false);
      return;
    }

    setTitle("");
    setHomeTeam("");
    setAwayTeam("");
    setKickoffTime("");
    setDescription("");
    setCustomOptions(["", ""]);
    setSubmitting(false);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div className="space-y-1">
        <span className="text-xs text-ink-muted">お題の種類</span>
        <div className="grid grid-cols-3 gap-2">
          {KIND_OPTIONS.map((o) => (
            <button
              key={o.kind}
              type="button"
              onClick={() => setMarketKind(o.kind)}
              className={`text-[11px] font-bold py-2 px-1.5 rounded-lg border ${
                marketKind === o.kind
                  ? "bg-accent text-white border-accent"
                  : "border-line-strong text-ink-muted"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-ink-faint">
          {KIND_OPTIONS.find((o) => o.kind === marketKind)?.hint}
        </p>
      </div>

      <label className="block space-y-1">
        <span className="text-xs text-ink-muted">タイトル</span>
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={marketKind === "match_winner" ? "例: 浦和レッズ vs FC東京" : "例: 開幕戦で〇〇選手はスタメン出場するか？"}
          className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm"
        />
      </label>

      {marketKind === "match_winner" ? (
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
      ) : marketKind === "binary" ? (
        <div className="flex gap-2">
          <span className="flex-1 text-center text-xs font-bold py-2 rounded-lg border border-line-strong text-ink-muted">はい</span>
          <span className="flex-1 text-center text-xs font-bold py-2 rounded-lg border border-line-strong text-ink-muted">いいえ</span>
        </div>
      ) : (
        <div className="space-y-2">
          <span className="text-xs text-ink-muted">選択肢（2〜8個）</span>
          {customOptions.map((opt, i) => (
            <div key={i} className="flex gap-2">
              <input
                required
                value={opt}
                onChange={(e) => updateOption(i, e.target.value)}
                placeholder={`選択肢 ${i + 1}`}
                className="flex-1 rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm"
              />
              {customOptions.length > 2 && (
                <button
                  type="button"
                  onClick={() => setCustomOptions((prev) => prev.filter((_, idx) => idx !== i))}
                  className="text-xs text-ink-faint px-2"
                >
                  削除
                </button>
              )}
            </div>
          ))}
          {customOptions.length < 8 && (
            <button
              type="button"
              onClick={() => setCustomOptions((prev) => [...prev, ""])}
              className="text-xs font-semibold text-accent-ink"
            >
              + 選択肢を追加
            </button>
          )}
        </div>
      )}

      <label className="block space-y-1">
        <span className="text-xs text-ink-muted">{marketKind === "match_winner" ? "キックオフ日時" : "判定期限"}</span>
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
