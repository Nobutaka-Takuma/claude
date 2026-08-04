import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/session";
import { placeBet, rpcErrorStatus, RpcError } from "@/lib/rpc";

const bodySchema = z.object({
  outcome: z.enum(["home", "away", "draw"]),
  amount: z.number().int().positive(),
});

export async function POST(req: Request, ctx: RouteContext<"/api/markets/[marketId]/bet">) {
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
    const bet = await placeBet(userId, marketId, parsed.data.outcome, parsed.data.amount);
    return NextResponse.json({ ok: true, bet });
  } catch (err) {
    if (err instanceof RpcError) {
      return NextResponse.json({ error: err.message }, { status: rpcErrorStatus(err.message) });
    }
    throw err;
  }
}
