import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth";
import { reviewTaskCompletion } from "@/lib/rpc";
import { rpcErrorResponse } from "@/lib/apiError";

// POST /api/completions/:completionId/review
//
// Operator verification of a submitted piece of work. The RPC re-checks
// the caller's role itself — this route's check is only so an ordinary
// user gets 403 instead of a database error.
const bodySchema = z.object({
  approve: z.boolean(),
  note: z.string().max(500).optional(),
});

export async function POST(req: Request, ctx: RouteContext<"/api/completions/[completionId]/review">) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (profile.role !== "admin" && profile.role !== "moderator") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { completionId } = await ctx.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const completion = await reviewTaskCompletion(
      profile.id,
      completionId,
      parsed.data.approve,
      parsed.data.note ?? null
    );
    return NextResponse.json({ ok: true, status: completion.status });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
