import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { voteMarketProposal, RpcError } from "@/lib/rpc";
import { rpcErrorResponse } from "@/lib/apiError";
import { MARKET_APPROVAL_THRESHOLD } from "@/lib/config";

export async function POST(_req: Request, ctx: RouteContext<"/api/markets/[marketId]/vote">) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { marketId } = await ctx.params;

  try {
    const market = await voteMarketProposal(userId, marketId, MARKET_APPROVAL_THRESHOLD());
    return NextResponse.json({ ok: true, market });
  } catch (err) {
    // A unique violation here only means they already voted — say that
    // instead of leaking the constraint name.
    if (err instanceof RpcError && err.message.includes("duplicate key")) {
      return NextResponse.json({ error: "already_voted" }, { status: 409 });
    }
    return rpcErrorResponse(err);
  }
}
