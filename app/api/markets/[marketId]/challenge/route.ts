import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/session";
import { query } from "@/lib/db";
import type { Challenge } from "@/lib/types";

const bodySchema = z.object({
  reason: z.string().min(5).max(1000),
  evidenceUrl: z.string().url().optional().or(z.literal("")),
});

const VOTING_WINDOW_HOURS = 24;

export async function POST(req: Request, ctx: RouteContext<"/api/markets/[marketId]/challenge">) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { marketId } = await ctx.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const marketResult = await query<{ status: string }>("select status from markets where id = $1", [marketId]);
  const market = marketResult.rows[0];
  if (!market) {
    return NextResponse.json({ error: "market_not_found" }, { status: 404 });
  }
  if (!["locked", "pending_resolution"].includes(market.status)) {
    return NextResponse.json({ error: "market_not_disputable" }, { status: 422 });
  }

  const result = await query<Challenge>(
    `insert into challenges (market_id, raised_by, reason, evidence_url, status, voting_deadline)
     values ($1, $2, $3, $4, 'open', now() + interval '${VOTING_WINDOW_HOURS} hours')
     returning *`,
    [marketId, userId, parsed.data.reason, parsed.data.evidenceUrl || null]
  );

  await query("update markets set status = 'disputed' where id = $1", [marketId]);

  return NextResponse.json({ ok: true, challenge: result.rows[0] });
}
