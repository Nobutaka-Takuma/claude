import Link from "next/link";
import { REPORT_CATEGORIES } from "@/lib/reportCategories";
import { MARKET_BAN_THRESHOLD, REPORT_REWARD, MARKET_CREATION_COST } from "@/lib/config";

export const metadata = {
  title: "コミュニティガイドライン",
};

export default function GuidelinesPage() {
  const threshold = MARKET_BAN_THRESHOLD();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-extrabold">コミュニティガイドライン</h1>
        <p className="text-xs text-ink-faint mt-1">
          誰でもマーケットを作れる場所なので、作ってはいけないものを先に決めておきます。
          判断に迷ったら作らない、を基本にしてください。
        </p>
      </div>

      <section className="rounded-xl border border-line bg-surface p-4 space-y-3">
        <h2 className="text-sm font-bold">このアプリのポイントについて</h2>
        <ul className="text-xs text-ink-muted space-y-1.5 list-disc pl-4">
          <li>
            ポイントは<strong>現金・暗号資産などに換金できません</strong>。金銭を賭ける行為ではありません。
          </li>
          <li>ポイントの購入もできません。広告視聴・アンケート・的中でのみ増えます。</li>
          <li>アカウント間でポイントを直接送ることはできません。</li>
        </ul>
      </section>

      <section className="rounded-xl border border-neg/40 bg-neg/5 p-4 space-y-3">
        <h2 className="text-sm font-bold text-neg">作ってはいけないマーケット</h2>
        <ul className="space-y-2">
          {REPORT_CATEGORIES.filter((c) => c.key !== "other").map((c) => (
            <li key={c.key} className="text-xs">
              <span className="font-bold">{c.label}</span>
              <span className="block text-ink-muted">{c.description}</span>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-ink-muted">
          特に、<strong>特定の人の死亡・死傷・自殺・事件の発生</strong>
          を予想の対象にすることは禁止です。誰かが結果を動かす動機を作ってしまうためで、
          この種の内容は作成時点で自動的に拒否されます。
        </p>
      </section>

      <section className="rounded-xl border border-line bg-surface p-4 space-y-3">
        <h2 className="text-sm font-bold">どんなお題を作っていい？</h2>
        <p className="text-xs text-ink-muted">
          <strong>厳密に判定できるものでなくて構いません。</strong>
          「アニメの次回はこう展開する」「あの新商品は売れる」のような、
          人によって見方が分かれるお題も歓迎です。判定はみんなの投票で決まります。
          迷ったらまず作ってみてください。
        </p>
        <ul className="text-xs text-ink-muted space-y-1.5 list-disc pl-4">
          <li>
            <strong>いつ結果が分かるかを決める</strong> — 「いつか実現するか」だと、
            いつまでも精算されず、賭けたポイントが戻りません。日時を切ってください
          </li>
          <li>
            <strong>選択肢を読めばどちらか判断できる</strong> — 曖昧でもいいのですが、
            「どちらとも取れる」書き方だと投票が割れて結論が出ません
          </li>
          <li>
            <strong>当事者が結果を操作できない</strong> — 身内の行動や、自分で実現できる出来事は不可
          </li>
          <li>
            <strong>対象が公人・公的な出来事である</strong> — 私人の私生活は対象にできません
          </li>
        </ul>
        <p className="text-[11px] text-ink-faint">
          下の「作ってはいけないマーケット」に当てはまらない限り、
          曖昧さを理由に停止されることはありません。
        </p>
      </section>

      <section className="rounded-xl border border-line bg-surface p-4 space-y-3">
        <h2 className="text-sm font-bold">🚩 通報とマーケットの停止</h2>
        <p className="text-xs text-ink-muted">
          ガイドラインに反するマーケットは、誰でも通報できます。
          <strong>通報が{threshold}件に達すると、そのマーケットは即座に停止</strong>されます。
        </p>
        <ul className="text-xs text-ink-muted space-y-1.5 list-disc pl-4">
          <li>予想されたポイントは<strong>全員に全額返金</strong>されます</li>
          <li>
            作成者が支払った作成料{MARKET_CREATION_COST()}ptは<strong>返金されません</strong>
          </li>
          <li>通報した人には{REPORT_REWARD()}ptが支払われます</li>
          <li>結果報告や異議申し立ての保証金は、預けた人に返却されます</li>
        </ul>
        <p className="text-[11px] text-ink-faint">
          通報は「気に入らない」ためのボタンではありません。根拠のない通報は他の人の予想を無効にしてしまいます。
          運営は通報を確認し、問題がないと判断した場合は通報を却下できます。却下されたマーケットは、
          それまでの通報では停止されません。
        </p>
      </section>

      <section className="rounded-xl border border-line bg-surface p-4 space-y-2">
        <h2 className="text-sm font-bold">判定について</h2>
        <p className="text-xs text-ink-muted">
          結果はコミュニティが報告し、24時間の異議申し立て期間を経て確定します。
          報告には保証金と<strong>証跡URL</strong>が必要で、誤った報告は保証金を失います。
          判定の根拠は誰でも確認できるよう公開されます。
        </p>
      </section>

      <p className="text-xs text-ink-faint">
        自動判定で誤って拒否された場合や、停止の判断に納得できない場合は運営までご連絡ください。
      </p>

      <Link href="/markets/propose" className="block text-center text-xs text-accent-ink font-semibold">
        マーケットを作る &gt;
      </Link>
    </div>
  );
}
