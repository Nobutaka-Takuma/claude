import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth";
import { submitProvisionalResult, rpcErrorStatus, RpcError } from "@/lib/rpc";
import { RESOLUTION_BOND, DISPUTE_WINDOW_MINUTES } from "@/lib/config";

// POST /api/markets/:marketId/submit-result
//
// The normal path out of 'locked': posts a provisional result WITHOUT
// paying anyone out yet, and starts the dispute_deadline clock.
//
// Open to any logged-in user, not just admins — no sports API can resolve
// the arbitrary questions users write ("will player X start?"), so
// resolution is a community act guarded by the optimistic oracle. A user
// proposing locks up RESOLUTION_BOND points, returned if their result
// stands and forfeited if a DAO vote overturns it. Admins propose without
// a bond, since they aren't betting against the house.
const bodySchema = z.object({
  outcome: z.string().min(1).max(40),
  disputeWindowMinutes: z.number().int().positive().max(60 * 24 * 7).optional(),
});

export async function POST(req: Request, ctx: RouteContext<"/api/markets/[marketId]/submit-result">) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { marketId } = await ctx.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const isAdmin = profile.role === "admin";

  try {
    const market = await submitProvisionalResult(
      marketId,
      parsed.data.outcome,
      parsed.data.disputeWindowMinutes ?? DISPUTE_WINDOW_MINUTES(),
      isAdmin ? null : profile.id,
      isAdmin ? 0 : RESOLUTION_BOND()
    );
    return NextResponse.json({ ok: true, market });
  } catch (err) {
    if (err instanceof RpcError) {
      return NextResponse.json({ error: err.message }, { status: rpcErrorStatus(err.message) });
    }
    throw err;
  }
}
