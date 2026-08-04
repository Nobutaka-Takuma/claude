// Auto-fetches results for markets that auto-locked at kickoff: for every
// api_auto market still waiting on a result, asks the sports API provider
// whether the fixture has finished, and if so submits it as the
// provisional result via submit_provisional_result — going through the
// same Optimistic Oracle dispute window as an admin-submitted result (see
// docs/03-wireframes.md), not an instant payout. finalize_expired_markets
// (invoked lazily on every market read, lib/data.ts) settles it once the
// window closes uncontested.
//
// Run with: npm run sync-results
import pg from "pg";
import { getProvider } from "./sports-api/index.mjs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const DISPUTE_WINDOW_MINUTES = Number(process.env.SPORTS_API_DISPUTE_WINDOW_MINUTES ?? 1440);

function scoreToOutcome(homeScore, awayScore) {
  if (homeScore > awayScore) return "home";
  if (awayScore > homeScore) return "away";
  return "draw";
}

async function main() {
  const provider = getProvider();

  // Mirrors sync_market_status's own lock check so a market whose kickoff
  // just passed is locked before we look for its result.
  await pool.query("select sync_market_status()");

  const { rows: pending } = await pool.query(
    `select id, external_ref, home_team, away_team
     from markets
     where source = 'api_auto' and status = 'locked' and external_ref is not null`
  );

  console.log(`Checking ${pending.length} locked auto-generated market(s) via provider "${provider.name}"...`);
  if (pending.length === 0) {
    console.log(
      "Nothing to check. A market only becomes eligible once its kickoff time has passed " +
        "(status 'locked'); run sync-fixtures first if you have no auto-generated markets yet."
    );
  }

  let settled = 0;
  let stillPending = 0;

  for (const market of pending) {
    const result = await provider.getFixtureResult(market.external_ref);

    if (!result || result.status !== "finished" || result.homeScore === null || result.awayScore === null) {
      stillPending++;
      continue;
    }

    const outcome = scoreToOutcome(result.homeScore, result.awayScore);
    await pool.query("select * from submit_provisional_result($1, $2, $3)", [
      market.id,
      outcome,
      DISPUTE_WINDOW_MINUTES,
    ]);

    console.log(
      `  ${market.home_team} ${result.homeScore} - ${result.awayScore} ${market.away_team} -> provisional outcome: ${outcome}`
    );
    settled++;
  }

  console.log(`Done. Submitted ${settled} provisional result(s), ${stillPending} still awaiting a finished match.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
