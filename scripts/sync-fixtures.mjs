// Auto-generates markets from upcoming fixtures: fetches the schedule
// from the configured sports API provider (mock by default, see
// scripts/sports-api/) and upserts each one via the upsert_auto_market
// RPC, keyed on external_ref so re-running this on a schedule (e.g. daily
// via cron) never creates duplicates and never touches a market that has
// already moved past 'open' (locked/settled/disputed markets are left
// alone even if the fixture's kickoff time shifts).
//
// Run with: npm run sync-fixtures
import pg from "pg";
import { getProvider } from "./sports-api/index.mjs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const DAYS_AHEAD = Number(process.env.SPORTS_API_SYNC_DAYS ?? 14);

async function main() {
  const provider = getProvider();
  console.log(`Fetching fixtures from provider "${provider.name}" (next ${DAYS_AHEAD} days)...`);
  if (provider.name === "api_football") {
    console.log(
      `  league=${process.env.API_FOOTBALL_LEAGUE_ID ?? "98 (default)"} ` +
        `season=${process.env.API_FOOTBALL_SEASON ?? `${new Date().getFullYear()} (default)`}`
    );
  }

  const fixtures = await provider.listUpcomingFixtures(DAYS_AHEAD);
  console.log(`Got ${fixtures.length} fixture(s).`);

  if (fixtures.length === 0) {
    console.warn(
      "No fixtures came back, so no markets were created or updated. If you expected real matches, " +
        "re-check the league/season above and that SPORTS_API_PROVIDER=api_football."
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

    const before = await pool.query("select status from markets where external_ref = $1", [f.externalRef]);
    const existed = before.rowCount > 0;

    await pool.query(
      "select * from upsert_auto_market($1, $2, $3, $4, $5, $6)",
      [f.externalRef, `${f.homeTeam} vs ${f.awayTeam}`, f.homeTeam, f.awayTeam, f.kickoffTime, "soccer"]
    );

    if (existed) updated++;
    else created++;
  }

  console.log(`Done. Created ${created}, updated ${updated}, skipped ${skipped} (not scheduled).`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
