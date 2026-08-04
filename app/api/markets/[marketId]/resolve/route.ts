import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth";
import { settleMarket, rpcErrorStatus, RpcError } from "@/lib/rpc";

const bodySchema = z.object({
  outcome: z.enum(["home", "away", "draw", "void"]),
});

export async function POST(req: Request, ctx: RouteContext<"/api/markets/[marketId]/resolve">) {
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
    const market = await settleMarket(marketId, parsed.data.outcome);
    return NextResponse.json({ ok: true, market });
  } catch (err) {
    if (err instanceof RpcError) {
      return NextResponse.json({ error: err.message }, { status: rpcErrorStatus(err.message) });
    }
    throw err;
  }
}
