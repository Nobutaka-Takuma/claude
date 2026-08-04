// Seeds a couple of curated news articles with an attached market, to
// validate the News-First feed UX (app/news) before building any real
// news-ingestion pipeline. Not idempotent by external key the way
// upsert_auto_market is — safe to run once against a freshly seeded DB;
// re-running will create duplicate articles.
//
// Run with: npm run seed-news
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  await seedFxArticle();
  await seedSportsArticle();
  console.log("News seed complete.");
  await pool.end();
}

async function seedFxArticle() {
  const article = await pool.query(
    `insert into news_articles (title, body, source, category, published_at)
     values ($1, $2, $3, 'economy', now() - interval '2 hours')
     returning id`,
    [
      "【為替速報】米金利据え置きで円安加速",
      "米連邦準備制度理事会（FRB）は政策金利の据え置きを決定した。市場ではこれを受けて円売り・ドル買いが進み、" +
        "一時1ドル＝155円台まで下落する場面があった。アナリストの間では、来週にかけてさらに円安が進行するとの見方と、" +
        "日銀の為替介入を警戒して反発するとの見方が分かれている。",
      "デモ経済ニュース",
    ]
  );
  const articleId = article.rows[0].id;

  const outcomeOptions = JSON.stringify([
    { key: "yes", label: "はい" },
    { key: "no", label: "いいえ" },
  ]);

  await pool.query(
    `insert into markets (
       title, description, category, source, kickoff_time, status,
       market_kind, outcome_options, news_article_id
     ) values ($1, $2, 'finance', 'news_curated', now() + interval '10 days', 'open', 'binary', $3, $4)`,
    [
      "来週末(8/14)までにドル円は156円台に到達する？",
      "上記ニュースを受けた為替予想マーケットです。",
      outcomeOptions,
      articleId,
    ]
  );
  console.log("seeded FX news article + binary market");
}

async function seedSportsArticle() {
  const existingMarket = await pool.query(
    "select id, home_team, away_team, kickoff_time from markets where status = 'open' and market_kind = 'match_winner' order by kickoff_time asc limit 1"
  );
  if (existingMarket.rowCount === 0) {
    console.log("no open match_winner market found to attach a sports article to, skipping");
    return;
  }
  const market = existingMarket.rows[0];

  const article = await pool.query(
    `insert into news_articles (title, body, source, category, published_at)
     values ($1, $2, $3, 'sports', now() - interval '5 hours')
     returning id`,
    [
      `【プレビュー】${market.home_team} vs ${market.away_team}、注目のカード`,
      `今節注目の一戦、${market.home_team}と${market.away_team}が激突する。両チームともに好調を維持しており、` +
        "接戦が予想される。現地観戦したファンからの声援も熱を帯びている。",
      "デモスポーツニュース",
    ]
  );
  const articleId = article.rows[0].id;

  await pool.query("update markets set news_article_id = $1 where id = $2", [articleId, market.id]);
  console.log(`seeded sports news article, linked to existing market ${market.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
