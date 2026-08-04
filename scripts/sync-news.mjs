// Pulls articles from the configured RSS feeds into news_articles, which
// is what the /news feed renders and what users create markets from.
//
// Idempotent: each item is upserted on its feed guid/link, so running
// this on a schedule refreshes existing articles instead of duplicating
// them. One dead feed doesn't stop the others — each is reported
// separately so a retired URL is visible rather than silent.
//
// Run with: npm run sync-news
import pg from "pg";
import { getFeeds } from "./news-sources/feeds.mjs";
import { fetchFeed } from "./news-sources/rssParser.mjs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const PER_FEED_LIMIT = Number(process.env.NEWS_SYNC_PER_FEED_LIMIT ?? 10);
const MAX_AGE_DAYS = Number(process.env.NEWS_SYNC_MAX_AGE_DAYS ?? 3);

async function main() {
  const feeds = getFeeds();
  console.log(`Syncing ${feeds.length} feed(s)...`);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failedFeeds = 0;

  for (const feed of feeds) {
    let items;
    try {
      items = await fetchFeed(feed.url);
    } catch (err) {
      failedFeeds++;
      console.warn(`  ✗ ${feed.url}\n      ${err.message}`);
      continue;
    }

    const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    let feedCreated = 0;
    let feedUpdated = 0;

    for (const item of items.slice(0, PER_FEED_LIMIT)) {
      if (!item.externalRef || !item.title) {
        skipped++;
        continue;
      }
      if (item.publishedAt && item.publishedAt.getTime() < cutoff) {
        skipped++;
        continue;
      }

      const existed = await pool.query("select 1 from news_articles where external_ref = $1", [
        item.externalRef,
      ]);

      await pool.query("select * from upsert_news_article($1, $2, $3, $4, $5, $6, $7)", [
        item.externalRef,
        item.title,
        // Headline-only feeds are common; falling back to the title keeps
        // news_articles.body's NOT NULL satisfied without inventing text.
        item.body || item.title,
        feed.source,
        feed.category,
        item.url || null,
        (item.publishedAt ?? new Date()).toISOString(),
      ]);

      if (existed.rowCount > 0) {
        feedUpdated++;
        updated++;
      } else {
        feedCreated++;
        created++;
      }
    }

    console.log(`  ✓ ${feed.url} (${feed.category}) — new ${feedCreated}, updated ${feedUpdated}`);
  }

  console.log(
    `Done. ${created} new article(s), ${updated} updated, ${skipped} skipped ` +
      `(older than ${MAX_AGE_DAYS} days or missing a title/id).`
  );
  if (failedFeeds > 0) {
    console.warn(
      `${failedFeeds} feed(s) failed. Publishers retire feed URLs regularly — verify the URL in ` +
        "scripts/news-sources/feeds.mjs, or override the whole list with the NEWS_FEEDS env var."
    );
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
