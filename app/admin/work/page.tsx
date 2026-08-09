import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import {
  getCampaignEconomics,
  getCampaignTasks,
  getCampaigns,
  getPendingReviewCompletions,
  getSponsors,
} from "@/lib/data";
import { formatDateTime, formatPoints, formatYen } from "@/lib/format";
import {
  MICRO_WORK_QUORUM,
  PEER_REVIEW_REWARD,
  POINT_VALUE_YEN,
  WORK_PAYOUT_RATIO_BPS,
} from "@/lib/config";
import { VERIFICATION_MODE_LABELS, workKindLabel } from "@/lib/workKinds";
import WorkAdminPanel from "@/components/WorkAdminPanel";
import CampaignControls from "@/components/CampaignControls";
import TaskActiveToggle from "@/components/TaskActiveToggle";
import ReviewCompletionButtons from "@/components/ReviewCompletionButtons";

// 案件・タスク・検収の管理画面。
//
// マーケット側の管理（/admin）とは分けてある。片方は「今この瞬間まずい
// ことが起きているか」を見る運用画面で、こちらは事業のほうだから。
export default async function WorkAdminPage() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") {
    redirect("/");
  }

  const [sponsors, campaigns, economics, tasks, reviewQueue] = await Promise.all([
    getSponsors(),
    getCampaigns(),
    getCampaignEconomics(),
    getCampaignTasks(),
    getPendingReviewCompletions(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-extrabold">案件・タスク管理</h1>
        <Link href="/admin" className="text-xs font-semibold text-accent-ink">
          マーケット管理へ &gt;
        </Link>
      </div>

      {/* 検収待ちが最初。ここが詰まると、作業した人のポイントが止まったままになる。 */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold">📥 検収待ち（{reviewQueue.length}件）</h2>
        {reviewQueue.length === 0 ? (
          <p className="text-xs text-ink-faint">運営の検収を待っている提出はありません。</p>
        ) : (
          <ul className="space-y-2">
            {reviewQueue.map((c) => (
              <li key={c.id} className="rounded-xl border border-line bg-surface p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{c.task_title}</span>
                  <span className="font-mono-num text-xs font-bold text-accent-ink">
                    +{formatPoints(c.reward_points)}
                  </span>
                </div>
                <p className="text-[11px] text-ink-faint">
                  {c.username} ・ {formatDateTime(c.completed_at)}
                </p>
                <dl className="space-y-1 rounded-lg bg-surface-2 p-2">
                  {Object.entries((c.submission?.answers as Record<string, unknown>) ?? {}).map(
                    ([key, value]) => (
                      <div key={key} className="text-[11px]">
                        <dt className="text-ink-faint">{key}</dt>
                        <dd className="whitespace-pre-wrap break-words">{String(value)}</dd>
                      </div>
                    )
                  )}
                </dl>
                <ReviewCompletionButtons completionId={c.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <WorkAdminPanel
        sponsors={sponsors}
        campaigns={campaigns}
        defaults={{
          pointValueYen: POINT_VALUE_YEN(),
          quorum: MICRO_WORK_QUORUM(),
          peerReviewReward: PEER_REVIEW_REWARD(),
          payoutRatioBps: WORK_PAYOUT_RATIO_BPS(),
        }}
      />

      <section className="space-y-2">
        <h2 className="text-sm font-bold">📊 案件ごとの採算</h2>
        <p className="text-[11px] text-ink-faint">
          「発生」は作業が完了した分の受取額、「入金」は実際に振り込まれた額です。
          差が開いている案件は請求漏れか、取りっぱぐれています。
        </p>
        {economics.length === 0 ? (
          <p className="text-xs text-ink-faint">案件がまだありません。</p>
        ) : (
          <ul className="space-y-2">
            {economics.map((c) => {
              const margin = Number(c.margin_yen);
              return (
                <li key={c.id} className="rounded-xl border border-line bg-surface p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{c.title}</span>
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                        c.status === "active"
                          ? "border-accent text-accent-ink"
                          : "border-line-strong text-ink-faint"
                      }`}
                    >
                      {c.status === "active"
                        ? "稼働中"
                        : c.status === "paused"
                          ? "停止中"
                          : c.status === "draft"
                            ? "下書き"
                            : "終了"}
                    </span>
                  </div>
                  <p className="text-[11px] text-ink-faint">
                    {c.sponsor_name} ・ {c.code}
                  </p>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                    <Stat label="完了" value={`${c.verified_completions}件`} />
                    <Stat label="検収待ち" value={`${c.pending_completions}件`} />
                    <Stat label="発生（受取）" value={formatYen(c.accrued_yen)} />
                    <Stat label="入金済み" value={formatYen(c.paid_yen)} />
                    <Stat label="付与ポイント" value={formatPoints(c.granted_points)} />
                    <Stat label="チェック報酬" value={formatPoints(c.review_points)} />
                    <Stat label="ポイント原価" value={formatYen(c.point_cost_yen)} />
                  </div>

                  <p
                    className={`text-xs font-bold ${margin < 0 ? "text-neg" : "text-accent-ink"}`}
                  >
                    差引 {formatYen(c.margin_yen)}
                    {margin < 0 && "（逆ざや：報酬を下げるか単価を上げてください）"}
                  </p>
                  {c.budget_yen && (
                    <p className="text-[11px] text-ink-faint">
                      予算 {formatYen(c.budget_yen)} のうち {formatYen(c.accrued_yen)} を消化
                    </p>
                  )}

                  <CampaignControls campaignId={c.id} status={c.status} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold">🧰 タスク一覧</h2>
        {tasks.length === 0 ? (
          <p className="text-xs text-ink-faint">タスクがまだありません。</p>
        ) : (
          <ul className="space-y-2">
            {tasks.map((t) => (
              <li
                key={t.id}
                className={`rounded-xl border p-3 space-y-1.5 ${
                  t.is_active ? "border-line bg-surface" : "border-line bg-surface-2 opacity-70"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{t.title}</span>
                  <span className="font-mono-num text-xs font-bold text-accent-ink">
                    +{formatPoints(t.reward_points)}
                  </span>
                </div>
                <p className="text-[11px] text-ink-faint">
                  {workKindLabel(t.work_kind)} ・ 検収: {VERIFICATION_MODE_LABELS[t.verification_mode]}
                  {t.verification_mode === "quorum" && `（${t.quorum_size}人 / チェック報酬 ${t.review_reward_points}pt）`}
                  {" ・ "}
                  {t.campaign_title ?? "案件なし"}
                  {" ・ 完了 "}
                  {t.completions}件
                  {t.max_completions_total ? ` / ${t.max_completions_total}件` : ""}
                </p>
                <TaskActiveToggle taskId={t.id} isActive={t.is_active} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-ink-faint">{label}</span>
      <span className="font-mono-num font-semibold">{value}</span>
    </div>
  );
}
