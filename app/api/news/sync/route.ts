import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { pool } from "@/lib/db";
import { syncNews } from "@/scripts/news-sources/syncNews.mjs";

// POST /api/news/sync
//
// Pulls the RSS feeds on demand, so the news list can be refreshed from
// inside the app instead of only by running the CLI. Restricted to
// admins, or to a caller presenting NEWS_SYNC_SECRET — the latter is how
// an external scheduler (cron, GitHub Actions) triggers it without a
// session. Long-running by nature: it makes one outbound request per
// feed.
export const maxDuration = 60;

export async function POST(req: Request) {
  const secret = process.env.NEWS_SYNC_SECRET;
  const presented = req.headers.get("x-news-sync-secret");
  const authorizedBySecret = Boolean(secret && presented && presented === secret);

  if (!authorizedBySecret) {
    const profile = await getCurrentProfile();
    if (!profile) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (profile.role !== "admin") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

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
