import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/session";
import { query } from "@/lib/db";

const bodySchema = z.object({
  votedOutcome: z.enum(["home", "away", "draw"]),
});

export async function POST(req: Request, ctx: RouteContext<"/api/challenges/[challengeId]/vote">) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { challengeId } = await ctx.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  try {
    await query(
      "insert into votes (challenge_id, user_id, voted_outcome) values ($1, $2, $3)",
      [challengeId, userId, parsed.data.votedOutcome]
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("duplicate key")) {
      return NextResponse.json({ error: "already_voted" }, { status: 409 });
    }
    throw err;
  }
}
