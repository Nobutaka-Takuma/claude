import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/session";
import { query } from "@/lib/db";
import { completeTask } from "@/lib/rpc";
import { rpcErrorResponse } from "@/lib/apiError";
import type { Task } from "@/lib/types";

// POST /api/tasks/:taskId/complete
//
// Handles both task types from an authenticated client:
//   - ad_view: the client has just finished a (simulated) rewarded-video
//     playback. In production this reward would instead be granted by
//     app/api/webhooks/ad-reward/route.ts, called server-to-server by the
//     ad network's own SSV callback — this route exists for local/demo use
//     where no real ad SDK is wired up.
//   - survey: answers are re-validated against the task's own required
//     question list before the reward is granted.
const bodySchema = z.object({
  answers: z.record(z.string(), z.union([z.string(), z.number(), z.array(z.string())])).optional(),
});

export async function POST(req: Request, ctx: RouteContext<"/api/tasks/[taskId]/complete">) {
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

  let verification: Record<string, unknown>;
  let idempotencyKey: string;

  if (task.type === "survey") {
    const requiredQuestionIds = (task.config?.required_question_ids as string[] | undefined) ?? [];
    const answers = parsed.data.answers ?? {};
    const missing = requiredQuestionIds.filter((q) => !(q in answers));
    if (missing.length > 0) {
      return NextResponse.json({ error: "incomplete_survey", missing }, { status: 422 });
    }
    verification = { type: "survey", answers };
    idempotencyKey = `survey:${taskId}:${userId}`;
  } else {
    verification = { type: "ad_view", provider: "local_demo_simulated_ssv" };
    idempotencyKey = `ad:${taskId}:${userId}:${crypto.randomUUID()}`;
  }

  try {
    const log = await completeTask(userId, taskId, idempotencyKey, verification);
    return NextResponse.json({ ok: true, log });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
