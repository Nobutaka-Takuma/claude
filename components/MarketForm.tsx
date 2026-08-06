"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiErrorMessage, isAuthError, fieldErrorMessage } from "@/lib/errorMessages";
import { CATEGORIES, categoryDef } from "@/lib/categories";

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
  seedAmount,
  approvalThreshold,
  onCreated,
}: {
  mode: MarketFormMode;
  newsArticleId?: string;
  defaultCategory?: string;
  defaultKind?: MarketKind;
  creationCost: number;
  creatorFeePct: number;
  seedAmount: number;
  approvalThreshold: number;
  onCreated?: () => void;
}) {
  const router = useRouter();
  const [marketKind, setMarketKind] = useState<MarketKind>(defaultKind);
  const [category, setCategory] = useState(defaultCategory);
  const [title, setTitle] = useState("");
  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const [league, setLeague] = useState("");
  const [matchweek, setMatchweek] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [resolvesAt, setResolvesAt] = useState("");
  const [description, setDescription] = useState("");
  const [customOptions, setCustomOptions] = useState(["", ""]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const catDef = categoryDef(category);
  const isSport = !!catDef.isSport;

  function updateOption(i: number, value: string) {
    setCustomOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)));
  }

  function reset() {
    setTitle("");
    setHomeTeam("");
    setAwayTeam("");
    setLeague("");
    setMatchweek("");
    setClosesAt("");
    setResolvesAt("");
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
      category,
      league: isSport && league.trim() ? league.trim() : undefined,
      matchweek: isSport && matchweek ? Number(matchweek) : undefined,
      homeTeam: marketKind === "match_winner" ? homeTeam : undefined,
      awayTeam: marketKind === "match_winner" ? awayTeam : undefined,
      outcomeOptions: marketKind === "match_winner" ? undefined : outcomeOptions,
    };

    const res = await fetch(mode === "paid" ? "/api/markets/create" : "/api/markets/propose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        mode === "paid"
          ? { ...shared, closesAt, resolvesAt: resolvesAt || undefined, newsArticleId }
          : { ...shared, kickoffTime: closesAt }
      ),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "unknown" }));
      if (isAuthError(body.error)) {
        router.push("/login");
        return;
      }
      setError(
        fieldErrorMessage(body.fields) ??
          apiErrorMessage(body.error, "マーケットを作成できませんでした。", body.detail)
      );
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
        <span className="text-xs text-ink-muted">カテゴリ</span>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setCategory(c.key)}
              className={`text-[11px] font-semibold py-1.5 px-2.5 rounded-full border ${
                category === c.key
                  ? "bg-ink text-bg border-ink"
                  : "border-line-strong text-ink-muted"
              }`}
            >
              {c.icon} {c.label}
            </button>
          ))}
        </div>
      </div>

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

      {isSport && (
        <div className="grid grid-cols-3 gap-2">
          <label className="block space-y-1 col-span-2">
            <span className="text-xs text-ink-muted">大会・リーグ</span>
            <input
              list="league-suggestions"
              value={league}
              onChange={(e) => setLeague(e.target.value)}
              placeholder="例: J1リーグ"
              className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm"
            />
            <datalist id="league-suggestions">
              {(catDef.leagueSuggestions ?? []).map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-ink-muted">第何節</span>
            <input
              type="number"
              min={1}
              max={99}
              value={matchweek}
              onChange={(e) => setMatchweek(e.target.value)}
              placeholder="21"
              className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm font-mono-num"
            />
          </label>
        </div>
      )}

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
          {marketKind === "match_winner" ? "キックオフ日時（ベット締切）" : "ベット締切日時"}
        </span>
        <input
          required
          type="datetime-local"
          value={closesAt}
          onChange={(e) => setClosesAt(e.target.value)}
          className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm"
        />
      </label>

      {mode === "paid" && (
        <label className="block space-y-1">
          <span className="text-xs text-ink-muted">結果判定の予定日時（任意）</span>
          <input
            type="datetime-local"
            value={resolvesAt}
            onChange={(e) => setResolvesAt(e.target.value)}
            className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm"
          />
          <span className="block text-[11px] text-ink-faint">
            いつ結果が分かるかの目安です。ベッターが「いつ決着するか」を判断できるようになります。
          </span>
        </label>
      )}

      <label className="block space-y-1">
        <span className="text-xs text-ink-muted">判定基準・補足（任意）</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="例: 東京市場の終値ベースで判定します。"
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
          ? `支払った${creationCost}ptのうち${seedAmount}ptが「初期賞金」としてマーケットに積まれ、的中者に分配されます（残りは運営手数料）。これにより最初にベットする人も勝てば増えます。さらに精算時のテラ銭の${creatorFeePct}%があなたに支払われます。`
          : `無料ですが、他のユーザーから賛成${approvalThreshold}票が集まるまで公開されません。初期賞金も作成者報酬もありません。`}
      </p>
    </form>
  );
}
