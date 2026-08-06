// Shared news-sync core, used by both `npm run sync-news` and the
// /api/news/sync route so the CLI and the in-app refresh button can never
// drift apart.
import { getFeeds } from "./feeds.mjs";
import { fetchFeed } from "./rssParser.mjs";

export async function syncNews(pool, { log = () => {} } = {}) {
  const feeds = getFeeds();
  const perFeedLimit = Number(process.env.NEWS_SYNC_PER_FEED_LIMIT ?? 10);
  const maxAgeDays = Number(process.env.NEWS_SYNC_MAX_AGE_DAYS ?? 3);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const failedFeeds = [];

  for (const feed of feeds) {
    let items;
    try {
      items = await fetchFeed(feed.url);
    } catch (err) {
      failedFeeds.push({ url: feed.url, message: err.message });
      log(`  x ${feed.url}\n      ${err.message}`);
      continue;
    }

    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    let feedCreated = 0;
    let feedUpdated = 0;

    for (const item of items.slice(0, perFeedLimit)) {
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

    log(`  v ${feed.url} (${feed.category}) - new ${feedCreated}, updated ${feedUpdated}`);
  }

  return { created, updated, skipped, failedFeeds, feedCount: feeds.length };
}
