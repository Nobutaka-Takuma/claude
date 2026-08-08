// Auto-generates markets from upcoming fixtures.
//
// The work lives in scripts/sports-api/syncFixtures.mjs so the same code
// runs from here, from the scheduled endpoint, and from the admin button.
//
// Run with: npm run sync-fixtures
import pg from "pg";
import { syncFixtures } from "./sports-api/syncFixtures.mjs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const result = await syncFixtures(pool, { log: (line) => console.log(line) });

  if (result.fetched === 0) {
    console.warn(
      "No fixtures came back, so no markets were created or updated. Check the provider settings — " +
        "for thesportsdb, run `npm run sports-leagues -- Japan Soccer` and confirm SPORTSDB_LEAGUES."
    );
  }

  console.log(
    `Done. Created ${result.created}, updated ${result.updated}, skipped ${result.skipped} (not scheduled).`
  );
  await pool.end();
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
