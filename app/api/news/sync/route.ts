import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { pool } from "@/lib/db";
import { isScheduledCaller } from "@/lib/cronAuth";
import { syncNews } from "@/scripts/news-sources/syncNews.mjs";

// POST/GET /api/news/sync
//
// Pulls the RSS feeds on demand, so the news list can be refreshed from
// inside the app instead of only by running the CLI. Open to admins with
// a session, or to a scheduler presenting a secret.
//
// GET exists because Vercel Cron only issues GET requests. It's guarded by
// the secret and nothing else — no session grants it — so a stray link
// can't kick off a feed crawl.
export const maxDuration = 60;

async function run() {
  try {
    const result = await syncNews(pool);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("news sync failed", err);
    return NextResponse.json(
      { error: "sync_failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  if (!isScheduledCaller(req)) {
    const profile = await getCurrentProfile();
    if (!profile) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (profile.role !== "admin") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }
  return run();
}

export async function GET(req: Request) {
  if (!isScheduledCaller(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return run();
}
