import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { cancelBet, rpcErrorStatus, RpcError } from "@/lib/rpc";
import { BET_CANCEL_PENALTY } from "@/lib/config";

// POST /api/bets/:betId/cancel
//
// Withdraw a bet while its market is still open, minus BET_CANCEL_PENALTY.
// The penalty is what stops cancelling from being a free option that gets
// exercised every time the odds move.
export async function POST(_req: Request, ctx: RouteContext<"/api/bets/[betId]/cancel">) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { betId } = await ctx.params;

  try {
    const bet = await cancelBet(userId, betId, BET_CANCEL_PENALTY());
    return NextResponse.json({ ok: true, bet });
  } catch (err) {
    if (err instanceof RpcError) {
      return NextResponse.json({ error: err.message }, { status: rpcErrorStatus(err.message) });
    }
    throw err;
  }
}
