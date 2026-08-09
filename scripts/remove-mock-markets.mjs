// Removes fixture markets that came from the mock provider.
//
// They carry external_ref starting "mock-j1-", so they're identifiable
// even after the fact. Rows aren't deleted: someone may already have bet
// on one, and the correct handling of a market that should never have
// existed is the same as any cancellation — void it and refund every
// stake. settle_market(id, 'void') does exactly that.
//
//   DATABASE_URL=... node scripts/remove-mock-markets.mjs          (dry run)
//   DATABASE_URL=... node scripts/remove-mock-markets.mjs --apply
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const apply = process.argv.includes("--apply");

async function main() {
  const { rows } = await pool.query(
    `select m.id, m.title, m.status, m.kickoff_time,
            (select count(*) from bets b where b.market_id = m.id and b.status = 'active') as active_bets
     from markets m
     where m.external_ref like 'mock-j1-%'
     order by m.kickoff_time`
  );

  if (rows.length === 0) {
    console.log("No mock fixture markets found. Nothing to do.");
    await pool.end();
    return;
  }

  console.log(`Found ${rows.length} mock fixture market(s):\n`);
  for (const m of rows) {
    console.log(`  ${m.status.padEnd(19)} ${m.title}  (active bets: ${m.active_bets})`);
  }

  if (!apply) {
    console.log("\nDry run. Re-run with --apply to void them and refund every stake.");
    await pool.end();
    return;
  }

  let voided = 0;
  let skipped = 0;
  for (const m of rows) {
    // Already settled or cancelled markets are past the point of voiding.
    if (!["proposed", "open", "locked", "pending_resolution", "disputed"].includes(m.status)) {
      skipped++;
      continue;
    }
    await pool.query("select settle_market($1, 'void')", [m.id]);
    voided++;
  }

  console.log(`\nVoided ${voided} market(s), skipped ${skipped} (already settled).`);
  console.log("All stakes on the voided markets have been refunded.");
  await pool.end();
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
