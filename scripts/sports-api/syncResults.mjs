// 結果の自動取得。`npm run sync-results`、/api/cron/tick、管理画面の
// ボタンで共有する本体。
//
// 取ってきた結果をそのまま確定にはしない。人が報告するときと同じ
// submit_provisional_result を通し、異議申し立て期間を置いてから
// finalize_expired_markets が精算する。APIも間違えるし、実際に中止・
// 再試合・スコア訂正は起きるので、機械が報告したというだけで
// 異議を挟む余地をなくすのは筋が悪い。
import { getProvider } from "./index.mjs";

function scoreToOutcome(homeScore, awayScore) {
  if (homeScore > awayScore) return "home";
  if (awayScore > homeScore) return "away";
  return "draw";
}

export async function syncResults(pool, { log = () => {}, allowMock = false } = {}) {
  const provider = getProvider();

  // sync-fixtures と同じ理由。モックのスコアは実在しない結果なので、
  // それでマーケットを精算するとポイントが根拠なく動く。
  if (provider.name === "mock" && !allowMock) {
    throw new Error(
      'SPORTS_API_PROVIDER is unset or set to "mock", which invents FAKE scores — ' +
        "refusing to settle markets from them. Set SPORTS_API_PROVIDER=thesportsdb."
    );
  }

  const disputeWindow = Number(process.env.SPORTS_API_DISPUTE_WINDOW_MINUTES ?? 1440);

  // キックオフを過ぎたマーケットを locked にしてから探す。
  await pool.query("select sync_market_status()");

  const { rows: pending } = await pool.query(
    `select id, external_ref, home_team, away_team
     from markets
     where source = 'api_auto' and status = 'locked' and external_ref is not null
     order by kickoff_time`
  );

  log(`Checking ${pending.length} locked auto-generated market(s) via provider "${provider.name}"...`);

  let submitted = 0;
  let stillPending = 0;
  let failed = 0;

  for (const market of pending) {
    let result;
    try {
      result = await provider.getFixtureResult(market.external_ref);
    } catch (err) {
      // 1試合の取得に失敗しても他は続ける。ここで throw すると、
      // 1件のデータ不備で残り全部の精算が止まる。
      failed++;
      log(`  ! ${market.home_team} vs ${market.away_team}: 取得に失敗 (${err.message.slice(0, 80)})`);
      continue;
    }

    if (!result || result.status !== "finished" || result.homeScore == null || result.awayScore == null) {
      stillPending++;
      continue;
    }

    const outcome = scoreToOutcome(result.homeScore, result.awayScore);
    await pool.query("select * from submit_provisional_result($1, $2, $3, null, 0, $4)", [
      market.id,
      outcome,
      disputeWindow,
      result.sourceUrl ?? null,
    ]);

    log(
      `  ${market.home_team} ${result.homeScore} - ${result.awayScore} ${market.away_team} -> ${outcome}`
    );
    submitted++;
  }

  return {
    provider: provider.name,
    checked: pending.length,
    submitted,
    stillPending,
    failed,
    disputeWindowMinutes: disputeWindow,
  };
}
