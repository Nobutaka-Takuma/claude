import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth";
import { submitProvisionalResult } from "@/lib/rpc";
import { rpcErrorResponse } from "@/lib/apiError";
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
//
// A report must explain itself. The evidence URL used to be mandatory and
// mostly stopped people reporting at all; the note replaces it. The dispute
// window is only useful if someone who wasn't watching can decide whether
// to object, and an outcome with no reasoning gives them nothing to go on.
// A correct report earns RESOLUTION_REWARD on top of the returned bond
// once it stands.
const bodySchema = z.object({
  outcome: z.string().min(1).max(40),
  resolutionNote: z.string().trim().min(10).max(1000),
  evidenceUrl: z.string().url().max(500).optional(),
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
    const fields = [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? "")))].filter(Boolean);
    return NextResponse.json({ error: "invalid_input", fields }, { status: 400 });
  }

  const isAdmin = profile.role === "admin";

  try {
    const market = await submitProvisionalResult(
      marketId,
      parsed.data.outcome,
      parsed.data.disputeWindowMinutes ?? DISPUTE_WINDOW_MINUTES(),
      isAdmin ? null : profile.id,
      isAdmin ? 0 : RESOLUTION_BOND(),
      parsed.data.evidenceUrl ?? null,
      parsed.data.resolutionNote
    );
    return NextResponse.json({ ok: true, market });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
