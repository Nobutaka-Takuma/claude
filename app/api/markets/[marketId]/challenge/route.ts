import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/session";
import { raiseChallenge } from "@/lib/rpc";
import { rpcErrorResponse } from "@/lib/apiError";
import { CHALLENGE_BOND, CHALLENGE_VOTING_HOURS } from "@/lib/config";

// POST /api/markets/:marketId/challenge
//
// Contest a proposed result. Costs the same bond the proposer posted:
// returned if the DAO agrees with you, forfeited (mostly to the proposer)
// if it doesn't. Without that symmetry, disputing would be a free way to
// stall every settlement.
const bodySchema = z.object({
  reason: z.string().min(5).max(1000),
  evidenceUrl: z.string().url().optional().or(z.literal("")),
});

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

  try {
    const challenge = await raiseChallenge(
      userId,
      marketId,
      parsed.data.reason,
      parsed.data.evidenceUrl || null,
      CHALLENGE_BOND(),
      CHALLENGE_VOTING_HOURS()
    );
    return NextResponse.json({ ok: true, challenge });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
