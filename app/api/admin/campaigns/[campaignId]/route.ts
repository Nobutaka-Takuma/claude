import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/adminGuard";
import { rpcErrorResponse } from "@/lib/apiError";
import type { Campaign } from "@/lib/types";

// PATCH /api/admin/campaigns/:campaignId — 案件のステータス変更
//
// 'active' 以外にした瞬間、その案件のタスクは submit_task_work に弾かれ、
// /tasks の一覧からも消える。広告主から止めてくれと言われたときの唯一の
// 操作なので、他の項目とは別の口にしてある。
const bodySchema = z.object({
  status: z.enum(["draft", "active", "paused", "finished"]),
});

export async function PATCH(req: Request, ctx: RouteContext<"/api/admin/campaigns/[campaignId]">) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const { campaignId } = await ctx.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", fields: ["status"] }, { status: 400 });
  }

  try {
    const result = await query<Campaign>(
      "update campaigns set status = $1 where id = $2 returning *",
      [parsed.data.status, campaignId]
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "campaign_not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, campaign: result.rows[0] });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
