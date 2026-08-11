import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { syncMarketStatus, finalizeExpiredMarkets } from "@/lib/rpc";
import { syncFixtures } from "@/scripts/sports-api/syncFixtures.mjs";
import { syncResults } from "@/scripts/sports-api/syncResults.mjs";
import { isScheduledCaller } from "@/lib/cronAuth";
import { rpcErrorResponse } from "@/lib/apiError";
import { BOND_AWARD_BPS, RESOLUTION_REWARD } from "@/lib/config";

// GET /api/cron/tick
//
// The market lifecycle normally advances lazily, on every page that reads
// markets — good enough while people are using the site, and it needs no
// scheduler. What it doesn't cover is a quiet night: a dispute window that
// closes at 3am settles whenever the next visitor happens to arrive, which
// could be hours later, and every payout waits with it.
//
// This endpoint runs the same two sweeps on a schedule so settlement
// happens close to when it was due, whether or not anyone is looking.
//
// It also pulls upcoming fixtures and finished results, rather than those
// being separate cron entries: Vercel's Hobby plan allows only a couple of
// scheduled jobs, and spending one on each would mean choosing between
// settlement and a populated board. A sports-source failure is reported
// but never fails the settlement sweep that already succeeded.
//
// Results are fetched BEFORE the settlement sweep. A match that finished
// overnight is then reported and — if its dispute window has already
// elapsed by the time the sweep runs — settled in the same tick, instead
// of waiting a further day for the next one.
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!isScheduledCaller(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sportsEnabled =
    Boolean(process.env.SPORTS_API_PROVIDER) && process.env.SPORTS_API_PROVIDER !== "mock";

  try {
    let results: unknown = "skipped";
    if (sportsEnabled) {
      try {
        results = await syncResults(pool, { log: (line) => console.log(line) });
      } catch (err) {
        console.error("result sync failed during tick", err);
        results = { error: err instanceof Error ? err.message : String(err) };
      }
    }

    await syncMarketStatus();
    await finalizeExpiredMarkets(BOND_AWARD_BPS(), RESOLUTION_REWARD());

    let fixtures: unknown = "skipped";
    if (sportsEnabled) {
      try {
        fixtures = await syncFixtures(pool, { log: (line) => console.log(line) });
      } catch (err) {
        console.error("fixture sync failed during tick", err);
        fixtures = { error: err instanceof Error ? err.message : String(err) };
      }
    }

    return NextResponse.json({ ok: true, at: new Date().toISOString(), results, fixtures });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
