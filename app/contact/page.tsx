import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { operatorInfo } from "@/lib/operator";
import ContactForm from "@/components/ContactForm";

export const metadata = {
  title: "お問い合わせ",
};

export default async function ContactPage() {
  const profile = await getCurrentProfile();
  const info = operatorInfo();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-extrabold">お問い合わせ</h1>
        <p className="text-xs text-ink-faint mt-1">
          ログインしていなくても送信できます。ログインできない場合のご連絡もこちらからどうぞ。
        </p>
      </div>

      {/* 自己解決できるものは先に案内する。窓口に来る問い合わせのうち
          そこそこの割合が「ポイントは換金できますか」なので。 */}
      <section className="rounded-xl border border-line bg-surface-2 p-4 space-y-2">
        <h2 className="text-sm font-bold">先に確認していただきたいこと</h2>
        <ul className="text-xs text-ink-muted space-y-1.5 list-disc pl-4">
          <li>
            <strong>ポイントは現金や商品と交換できません。</strong>
            本サービス内でのみ使える記録で、購入も譲渡もできません（
            <Link href="/terms" className="text-accent-ink font-semibold underline">
              利用規約 第1条
            </Link>
            ）
          </li>
          <li>
            提出したお仕事の報酬は、検収（運営の確認または他の参加者による相互チェック）を通過してから
            付与されます。
            <Link href="/tasks" className="text-accent-ink font-semibold mx-1 underline">
              タスクセンター
            </Link>
            で現在の状況を確認できます
          </li>
          <li>
            不適切なマーケットは、詳細画面の通報ボタンからご報告いただくほうが早く対応できます（
            <Link href="/guidelines" className="text-accent-ink font-semibold underline">
              ガイドライン
            </Link>
            ）
          </li>
        </ul>
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <ContactForm defaultName={profile?.username} />
      </section>

      <p className="text-[11px] text-ink-faint">
        ご記入いただいた内容は、お問い合わせへの回答のために利用します。取り扱いについては
        <Link href="/privacy" className="text-accent-ink font-semibold mx-1 underline">
          プライバシーポリシー
        </Link>
        をご確認ください。
        {info.contactEmail && (
          <>
            <br />
            フォームが利用できない場合は {info.contactEmail} 宛にご連絡ください。
          </>
        )}
      </p>
    </div>
  );
}
