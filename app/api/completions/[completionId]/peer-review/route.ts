import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/session";
import { peerReviewCompletion } from "@/lib/rpc";
import { rpcErrorResponse } from "@/lib/apiError";

// POST /api/completions/:completionId/peer-review
//
// One user's judgement on another user's submitted work. Enough agreeing
// votes pay the submitter; enough disagreeing ones reject it. Everything
// that makes this safe — one vote per person, not your own work, task must
// actually be peer-reviewed — is enforced in the RPC, because this is the
// one place where a user's click moves someone else's balance.
const bodySchema = z.object({
  approve: z.boolean(),
  note: z.string().max(500).optional(),
});

export async function POST(
  req: Request,
  ctx: RouteContext<"/api/completions/[completionId]/peer-review">
) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { completionId } = await ctx.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const completion = await peerReviewCompletion(
      userId,
      completionId,
      parsed.data.approve,
      parsed.data.note ?? null
    );
    return NextResponse.json({ ok: true, status: completion.status });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
