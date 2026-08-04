// Feeds pulled by `npm run sync-news`.
//
// Publishers move and retire feed URLs without notice, so treat this list
// as a starting point to verify, not a guarantee — sync-news reports each
// feed's status individually so a dead one is obvious rather than silent.
//
// `category` maps onto markets.category, which drives the icon and the
// category filter on /markets.
export const DEFAULT_FEEDS = [
  {
    url: "https://news.yahoo.co.jp/rss/topics/business.xml",
    source: "Yahoo!ニュース",
    category: "economy",
  },
  {
    url: "https://news.yahoo.co.jp/rss/topics/sports.xml",
    source: "Yahoo!ニュース",
    category: "soccer",
  },
  {
    url: "https://news.yahoo.co.jp/rss/topics/domestic.xml",
    source: "Yahoo!ニュース",
    category: "politics",
  },
  {
    url: "https://news.yahoo.co.jp/rss/topics/it.xml",
    source: "Yahoo!ニュース",
    category: "tech",
  },
  {
    url: "https://www.nhk.or.jp/rss/news/cat5.xml",
    source: "NHKニュース",
    category: "economy",
  },
  {
    url: "https://www.nhk.or.jp/rss/news/cat7.xml",
    source: "NHKニュース",
    category: "soccer",
  },
];

// NEWS_FEEDS accepts the same shape as DEFAULT_FEEDS, as JSON, so a
// deployment can swap sources without touching this file.
export function getFeeds() {
  const raw = process.env.NEWS_FEEDS;
  if (!raw) return DEFAULT_FEEDS;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("NEWS_FEEDS is not valid JSON. Expected e.g. [{\"url\":\"...\",\"source\":\"...\",\"category\":\"economy\"}]");
  }
  if (!Array.isArray(parsed) || parsed.some((f) => !f?.url)) {
    throw new Error("NEWS_FEEDS must be an array of objects each having at least a `url`.");
  }
  return parsed.map((f) => ({
    url: f.url,
    source: f.source ?? new URL(f.url).hostname,
    category: f.category ?? "general",
  }));
}
