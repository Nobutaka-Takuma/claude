import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import {
  getActiveTasks,
  getUserVerifiedCompletionCounts,
  getOpenVotingTasks,
  getOpenResolutionTasks,
  getPeerReviewQueue,
  getUserPendingSubmissions,
} from "@/lib/data";
import {
  VOTE_FLAT_REWARD,
  VOTE_REWARD_SLOTS,
  VOTER_RAKE_SHARE_BPS,
  RESOLUTION_BOND,
  RESOLUTION_REWARD,
} from "@/lib/config";
import { marketHeading } from "@/lib/outcome";
import { formatDateTime, formatRelativeToNow } from "@/lib/format";
import { formatPoints } from "@/lib/format";
import { workKindLabel } from "@/lib/workKinds";
import type { WorkFormField } from "@/lib/types";
import AdTaskButton from "@/components/AdTaskButton";
import SurveyTaskCard from "@/components/SurveyTaskCard";
import MicroWorkTaskCard from "@/components/MicroWorkTaskCard";
import PeerReviewCard from "@/components/PeerReviewCard";

export default async function TasksPage() {
  const profile = await getCurrentProfile();
  const tasks = await getActiveTasks();
  const completionCounts = profile ? await getUserVerifiedCompletionCounts(profile.id) : {};
  const votingTasks = profile ? await getOpenVotingTasks(profile.id, VOTE_REWARD_SLOTS()) : [];
  const resolutionTasks = profile ? await getOpenResolutionTasks() : [];
  const peerReviews = profile ? await getPeerReviewQueue(profile.id) : [];
  const mySubmissions = profile ? await getUserPendingSubmissions(profile.id) : [];

  if (!profile) {
    return (
      <div className="rounded-xl border border-line bg-surface p-5 text-sm">
        タスクを完了してポイントを貯めるには
        <Link href="/login" className="text-accent-ink font-semibold mx-1">
          ログイン
        </Link>
        してください。
      </div>
    );
  }

  const adTasks = tasks.filter((t) => t.type === "ad_view");
  const surveyTasks = tasks.filter((t) => t.type === "survey");
  const microWorkTasks = tasks.filter((t) => t.type === "micro_work");

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-extrabold">タスクセンター</h1>
      <p className="text-xs text-ink-faint">
        完了すると自動でポイントが付与され、同じ額がコミュニティ金庫にも積み立てられます。
        報酬の原資は、広告主・発注者から運営が受け取る対価です。
      </p>

      {/* 提出したものが今どうなっているかを、報酬より先に出す。作業して
          何も表示されないのが一番不安なので。 */}
      {mySubmissions.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold">🕓 提出したお仕事</h2>
          <ul className="space-y-2">
            {mySubmissions.map((s) => (
              <li
                key={s.id}
                className={`rounded-xl border p-3 space-y-1 ${
                  s.status === "rejected" ? "border-neg/40 bg-neg/5" : "border-line bg-surface"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{s.task_title}</span>
                  <span className="text-[11px] font-bold">
                    {s.status === "rejected" ? (
                      <span className="text-neg">やり直し</span>
                    ) : (
                      <span className="text-ink-muted">
                        チェック {s.approvals}/{s.quorum_size}
                      </span>
                    )}
                  </span>
                </div>
                <p className="text-[11px] text-ink-faint">{formatDateTime(s.completed_at)} に提出</p>
                {s.review_note && <p className="text-[11px] text-neg">理由: {s.review_note}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {peerReviews.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold">✅ 他の人の作業をチェックする</h2>
          <p className="text-[11px] text-ink-faint">
            提出された内容が指示どおりかを見て、OK / NG を選んでください。1件チェックするごとに報酬が付きます。
            規定の人数がOKを出すと、提出した人にポイントが支払われます。
          </p>
          {peerReviews.map((c) => (
            <PeerReviewCard
              key={c.id}
              completionId={c.id}
              taskTitle={c.task_title}
              username={c.username}
              answers={(c.submission?.answers as Record<string, unknown>) ?? {}}
              approvals={Number(c.approvals)}
              rejections={Number(c.rejections)}
              quorumSize={c.quorum_size}
              reviewRewardPoints={Number(c.review_reward_points)}
            />
          ))}
        </section>
      )}

      {resolutionTasks.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold">📝 結果の入力</h2>
          <p className="text-[11px] text-ink-faint">
            判定予定日時を過ぎたのに、まだ結果が報告されていないマーケットです。
            保証金{RESOLUTION_BOND()}ptを預けて証跡URLとともに報告し、その結果が確定すれば
            <span className="font-bold text-gold">保証金の返却＋{RESOLUTION_REWARD()}pt</span>を受け取れます。
            間違っていた場合、保証金は没収されます。
          </p>
          {resolutionTasks.map((m) => (
            <Link
              key={m.id}
              href={`/markets/${m.id}`}
              className="block rounded-xl border border-gold/50 bg-gold-soft p-4 space-y-1 hover:border-gold"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{marketHeading(m)}</span>
                <span className="font-mono-num text-xs font-bold text-gold">+{RESOLUTION_REWARD()}pt</span>
              </div>
              <p className="text-[11px] text-ink-muted">
                判定予定 {m.resolves_at ? formatRelativeToNow(m.resolves_at) : "—"} ・ 結果待ち
              </p>
            </Link>
          ))}
        </section>
      )}

      {votingTasks.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold">🗳 結果確定の投票</h2>
          <p className="text-[11px] text-ink-faint">
            正解の選択肢に投票すると先着{VOTE_REWARD_SLOTS()}名に{VOTE_FLAT_REWARD()}pt、
            さらに正解者全員で手数料の{VOTER_RAKE_SHARE_BPS() / 100}%を分け合えます。
          </p>
          {votingTasks.map((t) => (
            <Link
              key={t.challenge_id}
              href={`/markets/${t.id}`}
              className="block rounded-xl border border-gold/50 bg-gold-soft p-4 space-y-1 hover:border-gold"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{marketHeading(t)}</span>
                <span className="font-mono-num text-xs font-bold text-gold">
                  +{VOTE_FLAT_REWARD()}pt
                </span>
              </div>
              <p className="text-[11px] text-ink-muted">
                現在 {t.vote_count} 票 ・ 締切 {formatRelativeToNow(t.voting_deadline)}
              </p>
            </Link>
          ))}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-bold">🛠 お仕事</h2>
        {microWorkTasks.length === 0 && (
          <p className="text-xs text-ink-faint">現在募集中のお仕事はありません。</p>
        )}
        {microWorkTasks.map((task) => {
          const done = completionCounts[task.id] ?? 0;
          const max = task.max_completions_per_user;
          const reachedLimit = max !== null && done >= max;
          const config = task.config as {
            instructions?: string | null;
            reference_url?: string | null;
            fields?: WorkFormField[];
          };
          return (
            <div key={task.id} className="rounded-xl border border-line bg-surface p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{task.title}</span>
                <span className="font-mono-num text-xs font-bold text-accent-ink">
                  +{formatPoints(task.reward_points)}
                </span>
              </div>
              <p className="text-[11px] text-ink-faint">
                {workKindLabel(task.work_kind)}
                {task.verification_mode === "quorum" &&
                  ` ・ 他の参加者${task.quorum_size}名のチェック後に支払い`}
                {task.verification_mode === "review" && " ・ 運営の確認後に支払い"}
              </p>
              {task.description && <p className="text-xs text-ink-muted">{task.description}</p>}
              <MicroWorkTaskCard
                taskId={task.id}
                fields={config.fields ?? []}
                instructions={config.instructions}
                referenceUrl={config.reference_url}
                verificationMode={task.verification_mode}
                quorumSize={task.quorum_size}
                disabled={reachedLimit}
                disabledReason={reachedLimit ? "提出済みです" : undefined}
              />
              {!reachedLimit && max !== null && (
                <p className="text-[11px] text-ink-faint">残り {max - done}/{max} 回</p>
              )}
            </div>
          );
        })}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold">🎬 広告視聴</h2>
        {adTasks.length === 0 && <p className="text-xs text-ink-faint">現在利用可能な広告タスクはありません。</p>}
        {adTasks.map((task) => {
          const done = completionCounts[task.id] ?? 0;
          const max = task.max_completions_per_user;
          const reachedLimit = max !== null && done >= max;
          return (
            <div key={task.id} className="rounded-xl border border-line bg-surface p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{task.title}</span>
                <span className="font-mono-num text-xs font-bold text-accent-ink">
                  +{formatPoints(task.reward_points)}
                </span>
              </div>
              {task.description && <p className="text-xs text-ink-muted">{task.description}</p>}
              <AdTaskButton
                taskId={task.id}
                rewardPoints={Number(task.reward_points)}
                disabled={reachedLimit}
                disabledReason={max ? `本日の残り 0/${max}` : undefined}
              />
              {!reachedLimit && max !== null && (
                <p className="text-[11px] text-ink-faint">残り {max - done}/{max} 回</p>
              )}
            </div>
          );
        })}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold">📋 アンケート</h2>
        {surveyTasks.length === 0 && <p className="text-xs text-ink-faint">現在利用可能なアンケートはありません。</p>}
        {surveyTasks.map((task) => {
          const done = completionCounts[task.id] ?? 0;
          const max = task.max_completions_per_user;
          const reachedLimit = max !== null && done >= max;
          const questions = (task.config?.questions as { id: string; label: string; options: string[] }[]) ?? [];
          return (
            <div key={task.id} className="rounded-xl border border-line bg-surface p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{task.title}</span>
                <span className="font-mono-num text-xs font-bold text-accent-ink">
                  +{formatPoints(task.reward_points)}
                </span>
              </div>
              {task.description && <p className="text-xs text-ink-muted">{task.description}</p>}
              <SurveyTaskCard
                taskId={task.id}
                questions={questions}
                disabled={reachedLimit}
                disabledReason="回答済みです"
              />
            </div>
          );
        })}
      </section>
    </div>
  );
}
