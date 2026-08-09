import type { ReactNode } from "react";

// 規約・ポリシーの見た目を1か所に寄せるだけの部品。
//
// 法務ページは条項の追加・削除が頻繁に起きるところで、ページごとに
// クラス名を書いていると、そのうち条文によって字の大きさが違う規約が
// できあがる。読みにくい規約は読まれない。
export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4 space-y-2">
      <h2 className="text-sm font-bold">{title}</h2>
      {children}
    </section>
  );
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ol className="text-xs text-ink-muted space-y-1.5 list-decimal pl-4">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ol>
  );
}

export function LegalTable({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="text-xs divide-y divide-line">
      {rows.map(([label, value]) => (
        <div key={label} className="py-2 grid grid-cols-3 gap-2">
          <dt className="text-ink-faint font-semibold col-span-1">{label}</dt>
          <dd className="col-span-2 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

// 環境変数が埋まっていない項目のプレースホルダ。
// 「株式会社サンプル」のようなそれらしい偽の値を出すより、埋まっていない
// ことが誰の目にも分かるほうが安全。
export function Unset({ label }: { label: string }) {
  return <span className="text-neg font-bold">【未設定: {label}】</span>;
}
