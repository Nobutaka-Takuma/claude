import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { getActiveTasks, getUserVerifiedCompletionCounts } from "@/lib/data";
import { formatPoints } from "@/lib/format";
import AdTaskButton from "@/components/AdTaskButton";
import SurveyTaskCard from "@/components/SurveyTaskCard";

export default async function TasksPage() {
  const profile = await getCurrentProfile();
  const tasks = await getActiveTasks();
  const completionCounts = profile ? await getUserVerifiedCompletionCounts(profile.id) : {};

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

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-extrabold">タスクセンター</h1>
      <p className="text-xs text-ink-faint">
        完了すると自動でポイントが付与され、同時に金庫(Treasury)にも積み立てられます。
      </p>

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
