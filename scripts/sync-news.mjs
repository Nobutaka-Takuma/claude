// Pulls articles from the configured RSS feeds into news_articles, which
// is what the /news feed renders and what users create markets from.
//
// Idempotent: each item is upserted on its feed guid/link, so running
// this on a schedule refreshes existing articles instead of duplicating
// them. One dead feed doesn't stop the others - each is reported
// separately so a retired URL is visible rather than silent.
//
// Run with: npm run sync-news
//           npm run sync-news -- --watch        (repeat forever)
//           npm run sync-news -- --watch 15     (every 15 minutes)
import pg from "pg";
import { syncNews } from "./news-sources/syncNews.mjs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

function parseWatchMinutes(argv) {
  const i = argv.indexOf("--watch");
  if (i === -1) return null;
  const next = argv[i + 1];
  const minutes = next && !next.startsWith("--") ? Number(next) : NaN;
  return Number.isFinite(minutes) && minutes > 0
    ? minutes
    : Number(process.env.NEWS_SYNC_INTERVAL_MINUTES ?? 30);
}

async function runOnce() {
  const result = await syncNews(pool, { log: (line) => console.log(line) });
  console.log(
    `Done. ${result.created} new article(s), ${result.updated} updated, ${result.skipped} skipped.`
  );
  if (result.failedFeeds.length > 0) {
    console.warn(
      `${result.failedFeeds.length} feed(s) failed. Publishers retire feed URLs regularly - verify the ` +
        "URL in scripts/news-sources/feeds.mjs, or override the whole list with the NEWS_FEEDS env var."
    );
  }
}

async function main() {
  const watchMinutes = parseWatchMinutes(process.argv.slice(2));

  if (watchMinutes === null) {
    await runOnce();
    await pool.end();
    return;
  }

  console.log(`Watching: syncing every ${watchMinutes} minute(s). Ctrl+C to stop.`);
  // Deliberately sequential rather than setInterval: a slow sync should
  // delay the next run, not stack up overlapping ones against the same
  // feeds and database.
  for (;;) {
    console.log(`\n[${new Date().toLocaleTimeString("ja-JP")}] syncing...`);
    try {
      await runOnce();
    } catch (err) {
      console.error("sync failed, will retry next interval:", err.message ?? err);
    }
    await new Promise((r) => setTimeout(r, watchMinutes * 60 * 1000));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
