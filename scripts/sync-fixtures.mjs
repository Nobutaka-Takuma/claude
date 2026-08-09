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
  // Allowed here and nowhere else: running this script is a deliberate
  // act against whichever database you pointed it at, whereas the button
  // in the app is a production surface.
  const result = await syncFixtures(pool, { log: (line) => console.log(line), allowMock: true });

  if (result.provider === "mock") {
    console.warn(
      "\nWARNING: these are FAKE fixtures — invented matchups between real clubs.\n" +
        "         Never run this against a live database. Set SPORTS_API_PROVIDER=thesportsdb\n" +
        "         and SPORTSDB_LEAGUES to pull real matches."
    );
  }

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
