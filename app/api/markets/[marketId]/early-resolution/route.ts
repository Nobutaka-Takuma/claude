import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/session";
import { requestEarlyResolution, rpcErrorStatus, RpcError } from "@/lib/rpc";
import { EARLY_RESOLUTION_BOND, EARLY_RESOLUTION_VOTING_HOURS } from "@/lib/config";

// POST /api/markets/:marketId/early-resolution
//
// The result is already known but the betting deadline hasn't arrived.
// Paying a bond freezes the market at once and puts the outcome to a
// short DAO vote — there's no 24h optimistic window here because the
// market would otherwise keep taking bets on a settled question.
const bodySchema = z.object({
  outcome: z.string().min(1).max(40),
});

export async function POST(req: Request, ctx: RouteContext<"/api/markets/[marketId]/early-resolution">) {
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
    const challenge = await requestEarlyResolution(
      userId,
      marketId,
      parsed.data.outcome,
      EARLY_RESOLUTION_BOND(),
      EARLY_RESOLUTION_VOTING_HOURS()
    );
    return NextResponse.json({ ok: true, challenge });
  } catch (err) {
    if (err instanceof RpcError) {
      return NextResponse.json({ error: err.message }, { status: rpcErrorStatus(err.message) });
    }
    throw err;
  }
}
