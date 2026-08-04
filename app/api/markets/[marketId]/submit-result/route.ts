import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth";
import { submitProvisionalResult, rpcErrorStatus, RpcError } from "@/lib/rpc";

// POST /api/markets/:marketId/submit-result
//
// The normal path out of 'locked': posts a provisional result WITHOUT
// paying anyone out yet, and starts the dispute_deadline clock. Stands in
// for the sports-API/AI "one-shot judge" step of the Optimistic Oracle —
// see docs/03-wireframes.md. Finalization (auto-settle if uncontested, or
// DAO-vote settle if disputed) happens lazily via finalize_expired_markets,
// invoked from every market read (lib/data.ts).
const bodySchema = z.object({
  outcome: z.string().min(1).max(40),
  disputeWindowMinutes: z.number().int().positive().max(60 * 24 * 7),
});

export async function POST(req: Request, ctx: RouteContext<"/api/markets/[marketId]/submit-result">) {
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
    const market = await submitProvisionalResult(
      marketId,
      parsed.data.outcome,
      parsed.data.disputeWindowMinutes
    );
    return NextResponse.json({ ok: true, market });
  } catch (err) {
    if (err instanceof RpcError) {
      return NextResponse.json({ error: err.message }, { status: rpcErrorStatus(err.message) });
    }
    throw err;
  }
}
