"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiErrorMessage, isAuthError } from "@/lib/errorMessages";

export type MarketKind = "match_winner" | "binary" | "multi_outcome";

const KIND_OPTIONS: { kind: MarketKind; label: string; hint: string }[] = [
  { kind: "binary", label: "Yes / No", hint: "例: 来週末までにドル円は156円台に到達する？" },
  { kind: "match_winner", label: "試合の勝敗", hint: "ホーム / 引分 / アウェイの3択" },
  { kind: "multi_outcome", label: "複数選択肢", hint: "自由に選択肢を追加（2〜8個）" },
];

// "paid" opens the market immediately for a points fee and earns the
// creator a share of its rake; "free" costs nothing but waits for
// community approval votes before it opens.
export type MarketFormMode = "paid" | "free";

export default function MarketForm({
  mode,
  newsArticleId,
  defaultCategory = "general",
  defaultKind = "binary",
  creationCost,
  creatorFeePct,
  approvalThreshold,
  onCreated,
}: {
  mode: MarketFormMode;
  newsArticleId?: string;
  defaultCategory?: string;
  defaultKind?: MarketKind;
  creationCost: number;
  creatorFeePct: number;
  approvalThreshold: number;
  onCreated?: () => void;
}) {
  const router = useRouter();
  const [marketKind, setMarketKind] = useState<MarketKind>(defaultKind);
  const [title, setTitle] = useState("");
  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [description, setDescription] = useState("");
  const [customOptions, setCustomOptions] = useState(["", ""]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateOption(i: number, value: string) {
    setCustomOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)));
  }

  function reset() {
    setTitle("");
    setHomeTeam("");
    setAwayTeam("");
    setClosesAt("");
    setDescription("");
    setCustomOptions(["", ""]);
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

    const shared = {
      title,
      marketKind,
      description,
      category: newsArticleId ? defaultCategory : undefined,
      homeTeam: marketKind === "match_winner" ? homeTeam : undefined,
      awayTeam: marketKind === "match_winner" ? awayTeam : undefined,
      outcomeOptions: marketKind === "match_winner" ? undefined : outcomeOptions,
    };

    const res = await fetch(mode === "paid" ? "/api/markets/create" : "/api/markets/propose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        mode === "paid"
          ? { ...shared, closesAt, newsArticleId }
          : { ...shared, kickoffTime: closesAt }
      ),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "unknown" }));
      if (isAuthError(body.error)) {
        router.push("/login");
        return;
      }
      setError(apiErrorMessage(body.error, "マーケットを作成できませんでした。"));
      setSubmitting(false);
      return;
    }

    reset();
    setSubmitting(false);
    onCreated?.();
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
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
        <span className="text-xs text-ink-muted">質問文</span>
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={
            marketKind === "match_winner"
              ? "例: 浦和レッズ vs FC東京"
              : "例: 来週末(8/14)までにドル円は156円台に到達する？"
          }
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
          <span className="flex-1 text-center text-xs font-bold py-2 rounded-lg border border-line-strong text-ink-muted">
            はい
          </span>
          <span className="flex-1 text-center text-xs font-bold py-2 rounded-lg border border-line-strong text-ink-muted">
            いいえ
          </span>
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
        <span className="text-xs text-ink-muted">
          {marketKind === "match_winner" ? "キックオフ日時（ここでベット締切）" : "ベット締切日時"}
        </span>
        <input
          required
          type="datetime-local"
          value={closesAt}
          onChange={(e) => setClosesAt(e.target.value)}
          className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-ink-muted">補足説明（任意）</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="判定基準など。例: 東京市場の終値ベースで判定します。"
          className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm"
        />
      </label>

      {error && <p className="text-xs text-neg">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className={`w-full rounded-lg font-bold py-2.5 text-sm disabled:opacity-50 ${
          mode === "paid" ? "bg-gold text-white" : "bg-accent text-white"
        }`}
      >
        {submitting
          ? "送信中…"
          : mode === "paid"
            ? `${creationCost}pt を支払って公開する`
            : "無料で提案する"}
      </button>

      <p className="text-[11px] text-ink-faint">
        {mode === "paid"
          ? `すぐに公開され、ベットを受け付けます。的中者への配当後に残る運営手数料(テラ銭)のうち ${creatorFeePct}% があなたに支払われます。盛り上がったマーケットほど作成者の取り分が増えます。`
          : `無料ですが、他のユーザーから賛成${approvalThreshold}票が集まるまで公開されません。作成者への手数料分配はありません。`}
      </p>
    </form>
  );
}
