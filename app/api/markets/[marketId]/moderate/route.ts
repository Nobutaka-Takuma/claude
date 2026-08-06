import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth";
import { banMarket, dismissMarketReports } from "@/lib/rpc";
import { rpcErrorResponse } from "@/lib/apiError";
import { REPORT_REWARD } from "@/lib/config";

// POST /api/markets/:marketId/moderate
//
// The operator's two levers over a reported market, for the cases the
// vote alone handles badly:
//
//   ban     — something is bad enough that waiting for three reports is
//             the wrong call.
//   dismiss — the reports were wrong. Existing reports stop counting, so
//             the same group can't finish the job with one more vote.
//             This is the counterweight to a small threshold: without it,
//             three coordinated accounts could remove anything.
const bodySchema = z.object({
  action: z.enum(["ban", "dismiss"]),
  reason: z.string().max(300).optional(),
});

export async function POST(req: Request, ctx: RouteContext<"/api/markets/[marketId]/moderate">) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (profile.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { marketId } = await ctx.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  try {
    const market =
      parsed.data.action === "ban"
        ? await banMarket(
            marketId,
            parsed.data.reason ?? "運営がガイドライン違反と判断し停止しました",
            REPORT_REWARD()
          )
        : await dismissMarketReports(marketId);
    return NextResponse.json({ ok: true, market });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
