import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/session";
import { reportMarket } from "@/lib/rpc";
import { rpcErrorResponse } from "@/lib/apiError";
import { MARKET_BAN_THRESHOLD, REPORT_REWARD } from "@/lib/config";
import { REPORT_CATEGORY_KEYS } from "@/lib/reportCategories";

// POST /api/markets/:marketId/report
//
// Reports a market as violating the guidelines. Once MARKET_BAN_THRESHOLD
// people have said so, the market stops accepting bets, every stake is
// refunded, and the creator's fee is forfeited — all inside the same
// transaction as the report that crossed the line, so there is no window
// where the market is "banned but still taking money".
const bodySchema = z.object({
  category: z.enum(REPORT_CATEGORY_KEYS as [string, ...string[]]),
  note: z.string().max(500).optional(),
});

export async function POST(req: Request, ctx: RouteContext<"/api/markets/[marketId]/report">) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { marketId } = await ctx.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? "")))].filter(Boolean);
    return NextResponse.json({ error: "invalid_input", fields }, { status: 400 });
  }

  try {
    const market = await reportMarket(
      userId,
      marketId,
      parsed.data.category,
      parsed.data.note ?? null,
      MARKET_BAN_THRESHOLD(),
      REPORT_REWARD()
    );
    return NextResponse.json({ ok: true, banned: market.banned_at !== null, market });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
