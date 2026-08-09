import Link from "next/link";
import { operatorInfo } from "@/lib/operator";
import OperatorWarning from "@/components/OperatorWarning";
import { LegalSection, LegalTable, Unset } from "@/components/Legal";

export const metadata = {
  title: "運営者情報",
};

export default function OperatorPage() {
  const info = operatorInfo();

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-extrabold">運営者情報</h1>

      <OperatorWarning />

      <section className="rounded-xl border border-line bg-surface p-4">
        <LegalTable
          rows={[
            ["サービス名", info.serviceName],
            ["運営者", info.name ?? <Unset label="運営者名" />],
            ["代表者", info.representative ?? "—"],
            ["所在地", info.address ?? <Unset label="所在地" />],
            [
              "連絡先",
              info.contactEmail ? (
                <>
                  {info.contactEmail}
                  <Link href="/contact" className="text-accent-ink font-semibold ml-2 underline">
                    お問い合わせフォーム
                  </Link>
                </>
              ) : (
                <Unset label="連絡先メールアドレス" />
              ),
            ],
            ["サイトURL", info.siteUrl ?? <Unset label="サイトURL" />],
            ["開設", info.established ?? "—"],
            [
              "事業内容",
              info.businessDescription ?? "予測市場型コミュニティサービスの企画・運営、広告事業",
            ],
          ]}
        />
      </section>

      {/* 特商法表記との関係をはっきりさせておく。ポイントが有償でない今は
          対象外だが、「表記が無い」ことと「対象外である」ことは違うので、
          どちらなのかを書いておかないと利用者にも審査側にも分からない。 */}
      <LegalSection title="特定商取引法に基づく表記について">
        <p className="text-xs text-ink-muted">
          本サービスでは、利用者に対する有償の販売・役務の提供を行っていません。ポイントは購入できず、
          換金もできないため、現時点で特定商取引法に基づく表記の対象となる取引はありません。
        </p>
        <p className="text-xs text-ink-muted mt-2">
          有料機能・ポイントの販売など、利用者から代金を受け取る仕組みを追加する場合は、
          事業者名・所在地・電話番号・価格・支払方法・返品条件などを含む表記が別途必要になります。
        </p>
      </LegalSection>

      <LegalSection title="広告掲載・提携のご相談">
        <p className="text-xs text-ink-muted">
          広告出稿、タスクの発注、提携についてのご相談は、
          <Link href="/contact" className="text-accent-ink font-semibold mx-1 underline">
            お問い合わせフォーム
          </Link>
          から「広告掲載・提携のご相談」を選んでご連絡ください。
        </p>
      </LegalSection>

      <div className="flex flex-wrap gap-3 text-xs font-semibold">
        <Link href="/terms" className="text-accent-ink underline">
          利用規約
        </Link>
        <Link href="/privacy" className="text-accent-ink underline">
          プライバシーポリシー
        </Link>
        <Link href="/guidelines" className="text-accent-ink underline">
          コミュニティガイドライン
        </Link>
      </div>
    </div>
  );
}
