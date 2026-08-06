import { NextResponse } from "next/server";
import { syncMarketStatus, finalizeExpiredMarkets } from "@/lib/rpc";
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
export async function GET(req: Request) {
  if (!isScheduledCaller(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    await syncMarketStatus();
    await finalizeExpiredMarkets(BOND_AWARD_BPS(), RESOLUTION_REWARD());
    return NextResponse.json({ ok: true, at: new Date().toISOString() });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
