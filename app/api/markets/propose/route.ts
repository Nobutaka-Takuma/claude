import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/session";
import { proposeMarket } from "@/lib/rpc";
import { rpcErrorResponse } from "@/lib/apiError";

const bodySchema = z
  .object({
    title: z.string().min(3).max(120),
    marketKind: z.enum(["match_winner", "binary", "multi_outcome"]),
    kickoffTime: z.string().min(1),
    description: z.string().max(2000).optional(),
    category: z.string().max(40).optional(),
    homeTeam: z.string().min(1).max(60).optional(),
    awayTeam: z.string().min(1).max(60).optional(),
    outcomeOptions: z
      .array(z.object({ key: z.string().min(1).max(40), label: z.string().min(1).max(80) }))
      .min(2)
      .max(8)
      .optional(),
  })
  .refine((v) => v.marketKind !== "match_winner" || (v.homeTeam && v.awayTeam), {
    message: "home_away_required",
  })
  .refine((v) => v.marketKind === "match_winner" || (v.outcomeOptions && v.outcomeOptions.length >= 2), {
    message: "invalid_outcome_options",
  });

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    // Surface which fields failed so the form can say what to fix rather
    // than just "invalid".
    const fields = [
      ...new Set(
        parsed.error.issues.flatMap((i) =>
          i.path.length > 0 ? [String(i.path[0])] : (i.message ? [i.message] : [])
        )
      ),
    ];
    return NextResponse.json({ error: "invalid_input", fields }, { status: 400 });
  }

  try {
    const market = await proposeMarket({
      userId,
      title: parsed.data.title,
      marketKind: parsed.data.marketKind,
      kickoffTime: new Date(parsed.data.kickoffTime).toISOString(),
      outcomeOptions: parsed.data.outcomeOptions ?? [],
      description: parsed.data.description ?? null,
      category: parsed.data.category ?? "soccer",
      homeTeam: parsed.data.homeTeam ?? null,
      awayTeam: parsed.data.awayTeam ?? null,
    });
    return NextResponse.json({ ok: true, market });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
