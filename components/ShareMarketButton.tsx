"use client";

import { useState } from "react";

// マーケットを人に見せるためのボタン。
//
// 予想は1人だと成立しない。反対側に賭ける人がいて初めてプールができるので、
// 「誰かに見せる」導線がないアプリは、作られたマーケットが空のまま終わる。
//
// Web Share API が使える端末（スマホのほとんど）ではOSの共有シートを出し、
// 使えない環境ではURLをクリップボードにコピーする。
export default function ShareMarketButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.href;
    const text = `${title}\nあなたはどっち？`;

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch {
        // 共有シートを閉じただけのときもここに来る。コピーへ落とさず黙って終わる。
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // クリップボードが拒否される環境（http、権限なし）でも、
      // 押して無反応にはしない。
      window.prompt("このURLをコピーしてください", url);
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className="text-xs font-semibold text-ink-muted border border-line-strong rounded-lg px-3 py-1.5 hover:border-accent hover:text-accent-ink"
    >
      {copied ? "コピーしました" : "友だちに見せる"}
    </button>
  );
}
