import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/adminGuard";
import { rpcErrorResponse } from "@/lib/apiError";

// POST /api/admin/campaigns/:campaignId/payments — 入金の記録
//
// 発生額（作業が終わった分）と入金額を別に持つのは、成果は出したのに
// 請求も入金もされていない案件を見えるようにするため。ここに何も記録され
// ないまま件数だけ伸びている案件は、取りっぱぐれている案件そのもの。
//
// 返金・値引きを記録できるよう負の額も許す。
const bodySchema = z.object({
  amountYen: z.number().min(-100_000_000).max(100_000_000).refine((v) => v !== 0, "amount must not be 0"),
  memo: z.string().trim().max(300).optional(),
});

export async function POST(
  req: Request,
  ctx: RouteContext<"/api/admin/campaigns/[campaignId]/payments">
) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const { campaignId } = await ctx.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", fields: ["amountYen"] }, { status: 400 });
  }

  try {
    const exists = await query("select 1 from campaigns where id = $1", [campaignId]);
    if (exists.rows.length === 0) {
      return NextResponse.json({ error: "campaign_not_found" }, { status: 404 });
    }
    await query(
      "insert into campaign_payments (campaign_id, amount_yen, memo) values ($1, $2, $3)",
      [campaignId, parsed.data.amountYen, parsed.data.memo ?? null]
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
