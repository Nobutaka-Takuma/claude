import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/session";
import { placeBet } from "@/lib/rpc";
import { rpcErrorResponse } from "@/lib/apiError";

const bodySchema = z.object({
  outcome: z.string().min(1).max(40),
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
    return rpcErrorResponse(err);
  }
}
