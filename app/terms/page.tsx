import Link from "next/link";
import { operatorInfo, POLICY_REVISED_AT, MINIMUM_AGE, PARENTAL_CONSENT_AGE } from "@/lib/operator";
import OperatorWarning from "@/components/OperatorWarning";
import { LegalSection, LegalList } from "@/components/Legal";

export const metadata = {
  title: "利用規約",
};

export default function TermsPage() {
  const info = operatorInfo();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-extrabold">利用規約</h1>
        <p className="text-[11px] text-ink-faint mt-1">最終改定日: {POLICY_REVISED_AT}</p>
      </div>

      <OperatorWarning />

      <p className="text-xs text-ink-muted">
        本規約は、{info.name ?? "運営者"}（以下「当方」）が提供する「{info.serviceName}」
        （以下「本サービス」）の利用条件を定めるものです。本サービスを利用された方は、
        本規約に同意したものとみなします。
      </p>

      {/* ポイントの性質を最初に置く。本サービスが賭博にあたらない理由そのもの
          であり、規約の中で唯一「読んでいなかった」で済まされてはいけない部分。 */}
      <section className="rounded-xl border border-accent/50 bg-accent/5 p-4 space-y-2">
        <h2 className="text-sm font-bold">第1条（ポイントの性質 — 最も重要な点）</h2>
        <LegalList
          items={[
            "本サービスのポイントは、現金・電子マネー・暗号資産・商品その他一切の財産的価値と交換できません。",
            "ポイントを購入することはできません。ポイントはタスクの完了、マーケットの的中、その他当方が定める方法によってのみ増減します。",
            "ポイントを他の利用者へ譲渡・貸与・売買することはできません。",
            "したがって本サービスにおける予想は、金銭その他の財物を賭ける行為ではありません。",
            "ポイントは本サービス内でのみ意味を持つ記録であり、当方に対する債権を構成しません。",
          ]}
        />
      </section>

      <LegalSection title="第2条（アカウント）">
        <LegalList
          items={[
            `${MINIMUM_AGE()}歳未満の方は本サービスを利用できません。${PARENTAL_CONSENT_AGE()}歳未満の方は、保護者の同意を得たうえで利用してください。`,
            "1人の利用者が複数のアカウントを作成することを禁止します。ポイントの不正な取得につながるためです。",
            "登録したメールアドレス・パスワードの管理責任は利用者本人にあります。",
            "アカウントを他人に譲渡・貸与することはできません。",
          ]}
        />
      </LegalSection>

      <LegalSection title="第3条（マーケットの作成と判定）">
        <LegalList
          items={[
            <>
              作成できるマーケットの範囲は
              <Link href="/guidelines" className="text-accent-ink font-semibold mx-1 underline">
                コミュニティガイドライン
              </Link>
              に従います。禁止されている主題は作成時点で自動的に拒否されます。
            </>,
            "ガイドラインに違反するマーケットは、利用者からの通報が一定数に達した時点で停止され、参加者のポイントは全額返還されます。この場合、作成時に支払われた作成料は返還されません。",
            "結果の判定は利用者による報告と、異議申し立て・投票によって確定します。保証金を預けて報告した結果が覆された場合、保証金は返還されません。",
            "当方は、判定が明らかに誤っている場合、または不正が疑われる場合に、マーケットを中止し参加者へ返還する措置をとることがあります。",
          ]}
        />
      </LegalSection>

      <LegalSection title="第4条（タスク・お仕事と報酬）">
        <LegalList
          items={[
            "タスクの報酬ポイントは、成果物が所定の検収（運営による確認、または他の利用者による相互チェック）を通過した時点で付与されます。",
            "検収で否認された成果物に対して報酬は支払われません。指示と異なる内容、空欄のみの提出、明らかに作業を行っていない提出が該当します。",
            "広告主・提携先から成果が事後的に取り消された場合、当方は付与済みのポイントを取り消すことがあります。",
            "自動化ツール等により作業を行わずに報酬を得る行為、および他の利用者の成果物を内容を確認せずに承認する行為を禁止します。",
            "タスクへの参加は利用者の自由な判断によるものであり、当方と利用者との間に雇用関係は生じません。",
          ]}
        />
      </LegalSection>

      <LegalSection title="第5条（禁止事項）">
        <LegalList
          items={[
            "法令または公序良俗に違反する行為",
            "複数アカウントの作成、他人へのなりすまし",
            "自動化ツール・スクリプトによる不正なポイント取得",
            "本サービスの運営を妨害する行為、サーバーに過度の負荷をかける行為",
            "他の利用者と共謀して特定のマーケットの判定を歪める行為、または正当なマーケットを不当に通報する行為",
            "ポイントを対価とした現実の取引を行うこと、およびそれを持ちかけること",
            "その他、当方が不適切と判断する行為",
          ]}
        />
      </LegalSection>

      <LegalSection title="第6条（広告について）">
        <LegalList
          items={[
            "本サービスには広告が掲載されることがあります。",
            "広告主が提供する商品・サービスの内容および取引については、利用者と広告主との間で解決していただきます。当方はその内容を保証しません。",
            <>
              広告配信に伴うCookie等の取り扱いは
              <Link href="/privacy" className="text-accent-ink font-semibold mx-1 underline">
                プライバシーポリシー
              </Link>
              に定めます。
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="第7条（利用停止）">
        <p className="text-xs text-ink-muted">
          利用者が本規約に違反した場合、当方は事前の通知なくアカウントの利用を停止し、
          または保有ポイントを取り消すことがあります。不正な手段で取得されたポイントについては、
          その全部または一部を取り消すことがあります。
        </p>
      </LegalSection>

      <LegalSection title="第8条（サービスの変更・中断・終了）">
        <LegalList
          items={[
            "当方は、本サービスの内容を変更し、または提供を中断・終了することがあります。",
            "本サービスを終了する場合、当方は可能な限り事前に告知します。終了時点で保有されていたポイントは消滅し、これに対する補償は行いません（第1条のとおりポイントは財産的価値を持たないため）。",
            "長期間ログインのないアカウントについて、当方は事前の告知のうえでポイントを失効させることがあります。",
          ]}
        />
      </LegalSection>

      <LegalSection title="第9条（免責）">
        <LegalList
          items={[
            "当方は、本サービスの内容の正確性・完全性・有用性について保証しません。マーケットに表示される情報は利用者が作成したものを含みます。",
            "本サービスの利用によって利用者に生じた損害について、当方に故意または重大な過失がある場合を除き、責任を負いません。",
            "利用者間、または利用者と第三者との間で生じた紛争については、当事者間で解決していただきます。",
          ]}
        />
      </LegalSection>

      <LegalSection title="第10条（規約の変更）">
        <p className="text-xs text-ink-muted">
          当方は本規約を変更することがあります。変更後の規約は本ページに掲示した時点から効力を生じ、
          変更後も本サービスを利用された場合、変更に同意したものとみなします。
          重要な変更については本サービス上で告知します。
        </p>
      </LegalSection>

      <LegalSection title="第11条（準拠法・管轄）">
        <p className="text-xs text-ink-muted">
          本規約は日本法に準拠します。本サービスに関して紛争が生じた場合、
          当方の所在地を管轄する裁判所を第一審の専属的合意管轄裁判所とします。
        </p>
      </LegalSection>

      <p className="text-[11px] text-ink-faint">
        お問い合わせは
        <Link href="/contact" className="text-accent-ink font-semibold mx-1 underline">
          お問い合わせフォーム
        </Link>
        からお願いします。
      </p>
    </div>
  );
}
