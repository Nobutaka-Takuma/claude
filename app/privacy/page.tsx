import Link from "next/link";
import { operatorInfo, POLICY_REVISED_AT } from "@/lib/operator";
import OperatorWarning from "@/components/OperatorWarning";
import { LegalSection, LegalList, Unset } from "@/components/Legal";

export const metadata = {
  title: "プライバシーポリシー",
};

export default function PrivacyPage() {
  const info = operatorInfo();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-extrabold">プライバシーポリシー</h1>
        <p className="text-[11px] text-ink-faint mt-1">最終改定日: {POLICY_REVISED_AT}</p>
      </div>

      <OperatorWarning />

      <p className="text-xs text-ink-muted">
        {info.name ?? <Unset label="運営者名" />}（以下「当方」）は、「{info.serviceName}」
        （以下「本サービス」）における利用者の情報の取り扱いについて、以下のとおり定めます。
      </p>

      <LegalSection title="1. 取得する情報">
        <p className="text-xs text-ink-muted mb-2">本サービスは次の情報を取得します。</p>
        <LegalList
          items={[
            "アカウント登録時に入力される情報 — メールアドレス、ユーザー名、パスワード（パスワードは復元できない形式に変換して保存し、当方も内容を知ることはできません）",
            "本サービスの利用にともなって生じる記録 — 予想の内容、ポイントの増減、作成したマーケット、投稿したコメント、タスクの提出内容と検収結果、通報の内容",
            "アンケート・お仕事の回答内容 — 各タスクの画面に表示された項目で、当方および提携先が集計・分析に利用します",
            "お問い合わせの内容 — お名前、返信用メールアドレス、お問い合わせ本文",
            "アクセスに関する情報 — IPアドレス、ブラウザの種類、アクセス日時、参照元。IPアドレスは連投の防止のためにハッシュ化して保存し、そのままの形では保存しません",
            "Cookie およびこれに類する技術によって保存される情報 — ログイン状態の維持、および広告配信のために使用します",
          ]}
        />
      </LegalSection>

      <LegalSection title="2. 利用目的">
        <LegalList
          items={[
            "本サービスの提供、アカウントの認証、ポイントの記録と付与",
            "不正利用（複数アカウントの作成、自動化ツールによるポイント取得、判定の操作など）の検知と防止",
            "タスクの成果物の検収、および提携先への成果の報告",
            "お問い合わせへの回答",
            "本サービスの改善、利用状況の分析",
            "広告の配信および効果測定",
            "法令に基づく対応",
          ]}
        />
      </LegalSection>

      <LegalSection title="3. 第三者への提供">
        <p className="text-xs text-ink-muted mb-2">
          当方は、次の場合を除き、利用者を特定できる情報を第三者へ提供しません。
        </p>
        <LegalList
          items={[
            "利用者本人の同意がある場合",
            "法令に基づく場合、または人の生命・身体・財産の保護のために必要であって本人の同意を得ることが困難な場合",
            "アンケート・お仕事の回答について、個人を特定できない形に集計・加工したうえで提携先（広告主・調査会社等）へ提供する場合",
            "成果報酬型の広告・提携において、成果が発生したことを提携先へ通知する場合。この際に提供するのは当方が発行した識別子と成果の内容のみで、氏名・メールアドレスは含みません",
          ]}
        />
      </LegalSection>

      <LegalSection title="4. Cookie と広告配信について">
        <p className="text-xs text-ink-muted mb-2">
          本サービスでは、第三者の広告配信事業者が配信する広告を掲載することがあります。
          これらの事業者は、利用者の興味に応じた広告を表示するために Cookie
          を使用することがあります。
        </p>
        <LegalList
          items={[
            "Cookie には利用者を直接特定する情報（氏名・メールアドレスなど）は含まれません。",
            "ブラウザの設定で Cookie を無効にすることができますが、その場合ログイン状態を維持できないなど、本サービスの一部が利用できなくなります。",
            <>
              Google が配信する広告のパーソナライズは、
              <a
                href="https://myadcenter.google.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-ink font-semibold mx-1 underline"
              >
                Google 広告設定
              </a>
              から無効にできます。
            </>,
            <>
              その他の事業者による行動ターゲティング広告の停止は、
              <a
                href="https://optout.aboutads.info/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-ink font-semibold mx-1 underline"
              >
                aboutads.info
              </a>
              から行えます。
            </>,
          ]}
        />
      </LegalSection>

      {/* 電気通信事業法の外部送信規律。国内向けのWebサービスで、外部の
          広告・解析事業者にブラウザから直接情報が送られる構成なら、送信先と
          目的を利用者が確認できる状態にしておく必要がある。 */}
      <LegalSection title="5. 利用者情報の外部送信について">
        <p className="text-xs text-ink-muted">
          本サービスの一部の機能では、利用者の端末から外部の事業者へ情報が送信されることがあります。
          送信先の事業者、送信される情報、およびその利用目的は次のとおりです。
        </p>
        <p className="text-[11px] text-ink-faint mt-2">
          ※ 広告・アクセス解析の導入後、ここに送信先の事業者名（例: Google LLC）、送信される情報
          （Cookie、IPアドレス、閲覧ページのURL等）、利用目的、および各事業者のプライバシーポリシーへの
          リンクを追記してください。導入している事業者がない場合は「現在、外部送信を行っていません」と
          記載します。
        </p>
      </LegalSection>

      <LegalSection title="6. 保存期間">
        <LegalList
          items={[
            "アカウントに関する情報は、アカウントが存在する間保存します。",
            "ポイントの増減の記録は、不正の検証および会計上の必要から、アカウント削除後も一定期間保存することがあります。",
            "お問い合わせの内容は、対応の完了後、経緯を確認できるようにするため一定期間保存します。",
            "アクセスに関する情報は、不正利用の検知に必要な期間を経過した後に削除します。",
          ]}
        />
      </LegalSection>

      <LegalSection title="7. 安全管理措置">
        <LegalList
          items={[
            "パスワードは復元できない形式に変換して保存しています。",
            "情報は暗号化された通信経路を通じて送受信されます。",
            "情報にアクセスできる者を、業務上必要な範囲に限定しています。",
          ]}
        />
      </LegalSection>

      <LegalSection title="8. 開示・訂正・削除のご請求">
        <p className="text-xs text-ink-muted">
          利用者ご本人から、保有する個人情報の開示、訂正、利用の停止、削除のご請求があった場合、
          ご本人であることを確認したうえで、法令に従い対応します。
          <Link href="/contact" className="text-accent-ink font-semibold mx-1 underline">
            お問い合わせフォーム
          </Link>
          から「個人情報の開示・訂正・削除」を選んでご連絡ください。
        </p>
      </LegalSection>

      <LegalSection title="9. お問い合わせ窓口">
        <p className="text-xs text-ink-muted">
          本ポリシーに関するお問い合わせは、
          <Link href="/contact" className="text-accent-ink font-semibold mx-1 underline">
            お問い合わせフォーム
          </Link>
          、または {info.contactEmail ?? <Unset label="連絡先メールアドレス" />} までお願いします。
        </p>
      </LegalSection>

      <LegalSection title="10. 本ポリシーの変更">
        <p className="text-xs text-ink-muted">
          当方は本ポリシーを変更することがあります。変更後の内容は本ページに掲示した時点から適用されます。
          重要な変更については本サービス上で告知します。
        </p>
      </LegalSection>
    </div>
  );
}
