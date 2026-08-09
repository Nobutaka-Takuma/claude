import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/session";
import { query } from "@/lib/db";
import { submitTaskWork } from "@/lib/rpc";
import { rpcErrorResponse } from "@/lib/apiError";
import type { Task, WorkFormField } from "@/lib/types";

// POST /api/tasks/:taskId/submit
//
// The general submission endpoint for micro-work: the user fills in the
// form described by tasks.config.fields and posts the answers. Whether
// that turns into points immediately or waits for review is the task's
// decision (verification_mode), not the client's — the response says which
// happened so the UI can tell the truth either way.
//
// The old /complete route stays for ad_view and survey, whose reward is
// granted the moment the client says so. Anything a person actually
// produced comes through here instead.
const bodySchema = z.object({
  answers: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
});

export async function POST(req: Request, ctx: RouteContext<"/api/tasks/[taskId]/submit">) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { taskId } = await ctx.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const taskResult = await query<Task>("select * from tasks where id = $1", [taskId]);
  const task = taskResult.rows[0];
  if (!task) {
    return NextResponse.json({ error: "task_not_found" }, { status: 404 });
  }

  // Re-check required fields server-side. The client marks them `required`
  // too, but that is a convenience, not a control — a submission that
  // skipped them would otherwise go into the review queue as work someone
  // has to read before rejecting.
  const fields = (task.config?.fields as WorkFormField[] | undefined) ?? [];
  const answers = parsed.data.answers;
  const missing = fields
    .filter((f) => f.required)
    .filter((f) => {
      const value = answers[f.id];
      return value === undefined || value === null || String(value).trim() === "";
    })
    .map((f) => f.id);

  if (missing.length > 0) {
    return NextResponse.json({ error: "missing_required_fields", fields: missing }, { status: 422 });
  }

  // One submission per user per task by default; a repeatable task
  // (max_completions_per_user > 1 or null) needs a fresh key each time, and
  // the cooldown is what stops that becoming a loop.
  const idempotencyKey =
    task.max_completions_per_user === 1
      ? `work:${taskId}:${userId}`
      : `work:${taskId}:${userId}:${crypto.randomUUID()}`;

  try {
    const completion = await submitTaskWork(userId, taskId, idempotencyKey, { answers });
    return NextResponse.json({
      ok: true,
      status: completion.status,
      paid: completion.reward_log_id !== null,
      rewardPoints: Number(completion.reward_points),
    });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
