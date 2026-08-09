import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import {
  listMarkets,
  getProposedMarkets,
  getReportedMarkets,
  getContactMessages,
} from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { contactCategoryLabel } from "@/lib/contactCategories";
import ContactStatusButtons from "@/components/ContactStatusButtons";
import { marketHeading } from "@/lib/outcome";
import StatusBadge from "@/components/StatusBadge";
import AdminMarketForm from "@/components/AdminMarketForm";
import ModerateMarketButtons from "@/components/ModerateMarketButtons";
import SyncFixturesButton from "@/components/SyncFixturesButton";
import { reportCategoryLabel } from "@/lib/reportCategories";
import { ADMIN_MARKET_SEED, MARKET_BAN_THRESHOLD } from "@/lib/config";

export default async function AdminPage() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") {
    redirect("/");
  }

  const [settleable, proposed, reported, contacts] = await Promise.all([
    Promise.all([
      listMarkets("locked"),
      listMarkets("pending_resolution"),
      listMarkets("disputed"),
    ]).then((groups) => groups.flat()),
    getProposedMarkets(),
    getReportedMarkets(),
    getContactMessages(),
  ]);

  const openContacts = contacts.filter((c) => c.status !== "closed");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-extrabold">管理画面</h1>
        <Link href="/admin/work" className="text-xs font-semibold text-accent-ink">
          案件・タスク管理へ &gt;
        </Link>
      </div>

      <AdminMarketForm seedAmount={ADMIN_MARKET_SEED()} banThreshold={MARKET_BAN_THRESHOLD()} />

      <SyncFixturesButton />

      {/* First on the page: a reported market is the only thing here that
          gets worse the longer it waits. */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold">🚩 通報されたマーケット</h2>
        {reported.length === 0 ? (
          <p className="text-xs text-ink-faint">通報はありません。</p>
        ) : (
          <ul className="space-y-2">
            {reported.map((m) => (
              <li key={m.id} className="rounded-xl border border-neg/40 bg-neg/5 p-3 space-y-2">
                <Link href={`/markets/${m.id}`} className="block text-sm font-semibold hover:underline">
                  {marketHeading(m)}
                </Link>
                <p className="text-[11px] text-ink-muted">
                  通報 {m.report_count}/{MARKET_BAN_THRESHOLD()} 件 ・{" "}
                  {m.categories.map((c) => reportCategoryLabel(c)).join(" / ")}
                </p>
                <ModerateMarketButtons marketId={m.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold">✉️ お問い合わせ（未対応 {openContacts.length}件）</h2>
        {contacts.length === 0 ? (
          <p className="text-xs text-ink-faint">お問い合わせはありません。</p>
        ) : (
          <ul className="space-y-2">
            {contacts.map((m) => (
              <li
                key={m.id}
                className={`rounded-xl border p-3 space-y-2 ${
                  m.status === "new"
                    ? "border-gold/50 bg-gold-soft"
                    : m.status === "in_progress"
                      ? "border-line bg-surface"
                      : "border-line bg-surface-2 opacity-70"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{contactCategoryLabel(m.category)}</span>
                  <span className="text-[11px] font-bold text-ink-faint">
                    {m.status === "new" ? "未対応" : m.status === "in_progress" ? "対応中" : "対応済み"}
                  </span>
                </div>
                <p className="text-[11px] text-ink-faint">
                  {m.name}
                  {m.username && `（@${m.username}）`} ・ {m.email} ・ {formatDateTime(m.created_at)}
                </p>
                <p className="text-xs whitespace-pre-wrap break-words rounded-lg bg-surface-2 p-2">
                  {m.body}
                </p>
                {m.handler_note && (
                  <p className="text-[11px] text-ink-muted">対応メモ: {m.handler_note}</p>
                )}
                {m.status !== "closed" && (
                  <ContactStatusButtons messageId={m.id} status={m.status} />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold">判定・精算待ちのマーケット</h2>
        {settleable.length === 0 ? (
          <p className="text-xs text-ink-faint">対応が必要なマーケットはありません。</p>
        ) : (
          <ul className="space-y-2">
            {settleable.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/markets/${m.id}`}
                  className="flex items-center justify-between rounded-xl border border-line bg-surface p-3 text-sm hover:border-line-strong"
                >
                  <span>{m.market_kind === "match_winner" ? "⚽" : "❓"} {marketHeading(m)}</span>
                  <StatusBadge status={m.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold">承認待ちの提案</h2>
        {proposed.length === 0 ? (
          <p className="text-xs text-ink-faint">承認待ちの提案はありません。</p>
        ) : (
          <ul className="space-y-2">
            {proposed.map((m) => (
              <li key={m.id} className="rounded-xl border border-line bg-surface p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span>{m.market_kind === "match_winner" ? "⚽" : "❓"} {marketHeading(m)}</span>
                  <span className="text-xs text-ink-faint">{formatDateTime(m.kickoff_time)}</span>
                </div>
                <Link href="/markets/propose" className="text-xs text-accent-ink font-semibold">
                  提案ページで確認 &gt;
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
