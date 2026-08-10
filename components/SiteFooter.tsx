import { operatorInfo, SHOW_LEGAL_FOOTER } from "@/lib/operator";
import LegalLinks from "./LegalLinks";

// 全ページ共通のフッター。
//
// β版の間は既定で表示しません（SHOW_LEGAL_FOOTER=true で有効）。規約類へは
// マイページの下部からたどれます。一般公開時・広告審査の申し込み前には必ず
// true にしてください — 審査は「どのページからでもプライバシーポリシーに
// 到達できるか」を見ます。
export default function SiteFooter() {
  if (!SHOW_LEGAL_FOOTER()) return null;

  const info = operatorInfo();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-line bg-surface">
      <div className="max-w-3xl mx-auto px-4 py-5 space-y-3">
        <LegalLinks />
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
