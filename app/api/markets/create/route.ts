import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth";
import { createMarket } from "@/lib/rpc";
import { rpcErrorResponse } from "@/lib/apiError";
import {
  ADMIN_MARKET_SEED,
  MARKET_CREATION_COST,
  MARKET_CREATOR_FEE_BPS,
  MARKET_SEED_BPS,
} from "@/lib/config";

// POST /api/markets/create
//
// Paid market creation: charges MARKET_CREATION_COST, seeds most of it as
// prize money for the market's winners, and opens the market straight
// away. The creator is then entitled to a share of its rake. The free,
// vote-to-open alternative lives at /api/markets/propose.
//
// asAdmin skips the fee and has the treasury put up the seed instead —
// the operator filling a quiet board shouldn't have to farm points first.
// They take no creator fee in exchange, so running the place isn't also a
// way to skim the rake.
const bodySchema = z
  .object({
    title: z.string().min(3).max(120),
    marketKind: z.enum(["match_winner", "binary", "multi_outcome"]),
    closesAt: z.string().min(1),
    resolvesAt: z.string().min(1),
    description: z.string().max(2000).optional(),
    category: z.string().max(40).optional(),
    league: z.string().max(60).optional(),
    matchweek: z.number().int().positive().max(99).optional(),
    homeTeam: z.string().min(1).max(60).optional(),
    awayTeam: z.string().min(1).max(60).optional(),
    newsArticleId: z.string().uuid().nullish(),
    asAdmin: z.boolean().optional(),
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
  const profile = await getCurrentProfile();
  if (!profile) {
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

  const asAdmin = parsed.data.asAdmin === true;
  if (asAdmin && profile.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const market = await createMarket({
      userId: profile.id,
      title: parsed.data.title,
      marketKind: parsed.data.marketKind,
      closesAt: new Date(parsed.data.closesAt).toISOString(),
      resolvesAt: new Date(parsed.data.resolvesAt).toISOString(),
      outcomeOptions: parsed.data.outcomeOptions ?? [],
      description: parsed.data.description ?? null,
      category: parsed.data.category ?? "general",
      league: parsed.data.league ?? null,
      matchweek: parsed.data.matchweek ?? null,
      homeTeam: parsed.data.homeTeam ?? null,
      awayTeam: parsed.data.awayTeam ?? null,
      newsArticleId: parsed.data.newsArticleId ?? null,
      creationCost: asAdmin ? 0 : MARKET_CREATION_COST(),
      creatorFeeBps: asAdmin ? 0 : MARKET_CREATOR_FEE_BPS(),
      seedBps: MARKET_SEED_BPS(),
      seedAmount: asAdmin ? ADMIN_MARKET_SEED() : null,
    });
    return NextResponse.json({ ok: true, market });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
