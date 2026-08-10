import Link from "next/link";

export const LEGAL_LINKS = [
  { href: "/guidelines", label: "ガイドライン" },
  { href: "/terms", label: "利用規約" },
  { href: "/privacy", label: "プライバシーポリシー" },
  { href: "/operator", label: "運営者情報" },
  { href: "/contact", label: "お問い合わせ" },
];

// 規約類へのリンク。β版の間はマイページの隅にだけ置き、一般公開時に
// SHOW_LEGAL_FOOTER=true でフッターにも出す。どちらも同じ一覧を使うので、
// ページを増やしたときに片方だけ更新し忘れることがない。
export default function LegalLinks({ muted = false }: { muted?: boolean }) {
  return (
    <nav className="flex flex-wrap gap-x-3 gap-y-1.5">
      {LEGAL_LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`text-[11px] ${
            muted ? "text-ink-faint hover:text-ink-muted" : "font-semibold text-ink-muted hover:text-accent-ink"
          }`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
