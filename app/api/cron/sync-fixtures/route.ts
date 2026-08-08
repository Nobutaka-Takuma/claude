import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { pool } from "@/lib/db";
import { isScheduledCaller } from "@/lib/cronAuth";
import { syncFixtures } from "@/scripts/sports-api/syncFixtures.mjs";

// GET/POST /api/cron/sync-fixtures
//
// Creates markets for upcoming fixtures. GET is for Vercel Cron (which
// only issues GET) and needs the secret; POST additionally accepts an
// admin session, which is what the button on /admin uses.
//
// Long-running: one outbound request per configured league.
export const maxDuration = 60;

async function run() {
  try {
    const result = await syncFixtures(pool, { log: (line) => console.log(line) });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("fixture sync failed", err);
    return NextResponse.json(
      { error: "sync_failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  if (!isScheduledCaller(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return run();
}

export async function POST(req: Request) {
  if (!isScheduledCaller(req)) {
    const profile = await getCurrentProfile();
    if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (profile.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return run();
}
