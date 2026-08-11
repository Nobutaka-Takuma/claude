// Shared fixture-sync core, used by `npm run sync-fixtures`, the
// /api/cron/sync-fixtures endpoint and the admin button — so the CLI and
// the in-app trigger can never drift apart.
//
// Idempotent on external_ref: re-running never duplicates a market, never
// re-seeds one that already exists, and never touches a market that has
// moved past 'open' (a locked or settled match keeps its kickoff time even
// if the source later revises it).
import { getProvider } from "./index.mjs";

export async function syncFixtures(pool, { log = () => {}, allowMock = false } = {}) {
  const provider = getProvider();

  // The mock provider invents matchups between real J-League clubs, which
  // is indistinguishable from a real fixture list once it's in the
  // database — people bet on matches that will never be played. It exists
  // so the CLI is runnable without any configuration, and it must never
  // reach a live site, so anything triggered from the web app refuses it
  // rather than quietly filling the board with fiction.
  if (provider.name === "mock" && !allowMock) {
    throw new Error(
      "SPORTS_API_PROVIDER is unset or set to \"mock\", which generates FAKE fixtures — " +
        "refusing to create markets from them. Set SPORTS_API_PROVIDER=thesportsdb and " +
        "SPORTSDB_LEAGUES to pull real matches."
    );
  }
  const daysAhead = Number(process.env.SPORTS_API_SYNC_DAYS ?? 14);
  const seedAmount = Number(process.env.AUTO_MARKET_SEED ?? 90);
  // 1回の同期で作るマーケットの上限。
  //
  // 取得元がシーズン全体を返すようになったので、期間の絞り込みが何かの
  // 拍子に効かなくなると、1シーズン分（数百試合）のマーケットが一度に
  // でき、そのぶん初期賞金が金庫から出ていく。取り返しがつくうちに止める
  // ための弁で、通常の1〜2週間分がこれに引っかかることはない。
  const maxPerSync = Number(process.env.SPORTS_API_MAX_MARKETS_PER_SYNC ?? 60);

  log(`Fetching fixtures from provider "${provider.name}" (next ${daysAhead} days)...`);

  const allFixtures = await provider.listUpcomingFixtures(daysAhead);

  // キックオフの早い順に切る。上限に当たったとき、見送られるのが遠い先の
  // 試合になるようにするため（近い試合が落ちるほうが困る）。
  const sorted = [...allFixtures].sort(
    (a, b) => new Date(a.kickoffTime) - new Date(b.kickoffTime)
  );
  const fixtures = sorted.slice(0, maxPerSync);
  const truncated = sorted.length - fixtures.length;

  log(`Got ${allFixtures.length} fixture(s).`);
  if (truncated > 0) {
    log(
      `WARNING: 1回あたりの上限 ${maxPerSync} 件を超えたため、キックオフの遅い ${truncated} 件は今回見送りました。` +
        `次回の同期で取り込まれます（上限は SPORTS_API_MAX_MARKETS_PER_SYNC で変更できます）。`
    );
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const f of fixtures) {
    if (f.status !== "scheduled") {
      skipped++;
      continue;
    }

    const before = await pool.query("select 1 from markets where external_ref = $1", [f.externalRef]);
    const existed = (before.rowCount ?? 0) > 0;

    await pool.query(
      "select * from upsert_auto_market($1, $2, $3, $4, $5, $6, $7, $8, $9)",
      [
        f.externalRef,
        `${f.homeTeam} vs ${f.awayTeam}`,
        f.homeTeam,
        f.awayTeam,
        f.kickoffTime,
        f.category ?? "soccer",
        f.league ?? null,
        f.matchweek ?? null,
        // Only the first insert consumes this; the RPC ignores it on
        // update so a daily run can't top up an existing prize pot.
        existed ? 0 : seedAmount,
      ]
    );

    if (existed) updated++;
    else created++;
  }

  return {
    provider: provider.name,
    daysAhead,
    fetched: allFixtures.length,
    processed: fixtures.length,
    truncated,
    created,
    updated,
    skipped,
  };
}
