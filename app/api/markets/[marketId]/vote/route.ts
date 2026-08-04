import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { voteMarketProposal, rpcErrorStatus, RpcError } from "@/lib/rpc";
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
    if (err instanceof RpcError) {
      const status = err.message.includes("duplicate key") ? 409 : rpcErrorStatus(err.message);
      return NextResponse.json({ error: err.message }, { status });
    }
    throw err;
  }
}
