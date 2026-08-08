// Shared fixture-sync core, used by `npm run sync-fixtures`, the
// /api/cron/sync-fixtures endpoint and the admin button — so the CLI and
// the in-app trigger can never drift apart.
//
// Idempotent on external_ref: re-running never duplicates a market, never
// re-seeds one that already exists, and never touches a market that has
// moved past 'open' (a locked or settled match keeps its kickoff time even
// if the source later revises it).
import { getProvider } from "./index.mjs";

export async function syncFixtures(pool, { log = () => {} } = {}) {
  const provider = getProvider();
  const daysAhead = Number(process.env.SPORTS_API_SYNC_DAYS ?? 14);
  const seedAmount = Number(process.env.AUTO_MARKET_SEED ?? 90);

  log(`Fetching fixtures from provider "${provider.name}" (next ${daysAhead} days)...`);

  const fixtures = await provider.listUpcomingFixtures(daysAhead);
  log(`Got ${fixtures.length} fixture(s).`);

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

  return { provider: provider.name, fetched: fixtures.length, created, updated, skipped };
}
