import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/adminGuard";
import { rpcErrorResponse } from "@/lib/apiError";
import type { Task } from "@/lib/types";

// PATCH /api/admin/tasks/:taskId — タスクの公開/停止
//
// 削除ではなく停止にしてあるのは、既に提出された分の実績と、その提出が
// どの条件で受け付けられたかが残っていないと、あとから報酬の是非を検証
// できなくなるため。
const bodySchema = z.object({
  isActive: z.boolean(),
});

export async function PATCH(req: Request, ctx: RouteContext<"/api/admin/tasks/[taskId]">) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const { taskId } = await ctx.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", fields: ["isActive"] }, { status: 400 });
  }

  try {
    const result = await query<Task>("update tasks set is_active = $1 where id = $2 returning *", [
      parsed.data.isActive,
      taskId,
    ]);
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "task_not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, task: result.rows[0] });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
