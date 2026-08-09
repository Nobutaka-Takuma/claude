import Link from "next/link";
import { operatorInfo } from "@/lib/operator";

// 法務ページへの導線。
//
// フッターに置いてあるのは体裁の問題ではなく、広告ネットワーク・ASPの
// 審査が「どのページからでもプライバシーポリシーに到達できるか」を見る
// ため。利用者にとっても、規約を探すのに設定画面を掘る必要がない。
const LINKS = [
  { href: "/guidelines", label: "ガイドライン" },
  { href: "/terms", label: "利用規約" },
  { href: "/privacy", label: "プライバシーポリシー" },
  { href: "/operator", label: "運営者情報" },
  { href: "/contact", label: "お問い合わせ" },
];

export default function SiteFooter() {
  const info = operatorInfo();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-line bg-surface">
      <div className="max-w-3xl mx-auto px-4 py-5 space-y-3">
        <nav className="flex flex-wrap gap-x-4 gap-y-2">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-[11px] font-semibold text-ink-muted hover:text-accent-ink">
              {l.label}
            </Link>
          ))}
        </nav>
        <p className="text-[11px] text-ink-faint leading-relaxed">
          本サービスのポイントは現金・商品等と交換できません。購入も譲渡もできず、金銭を賭ける行為ではありません。
        </p>
        <p className="text-[11px] text-ink-faint">
          © {year} {info.name ?? info.serviceName}
        </p>
      </div>
    </footer>
  );
}
