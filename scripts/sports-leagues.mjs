// Prints TheSportsDB league IDs for a country, so nobody has to guess
// them or copy one out of a stale blog post.
//
//   npm run sports-leagues -- Japan Soccer
//   npm run sports-leagues -- Japan Baseball
//   npm run sports-leagues -- Japan Soccer --raw    (dump the API response)
//
// Paste the ids you want into SPORTSDB_LEAGUES, e.g.
//   SPORTSDB_LEAGUES=[{"id":"4363","name":"J1リーグ","category":"soccer"}]
import { searchLeagues, apiKey, rawLookup } from "./sports-api/theSportsDbProvider.mjs";

const args = process.argv.slice(2).filter((a) => a !== "--raw");
const raw = process.argv.includes("--raw");
const [country = "Japan", sport = "Soccer"] = args;

const usingOwnKey = Boolean(process.env.SPORTSDB_KEY);
console.log(
  `Looking up ${country} / ${sport} using ${usingOwnKey ? "SPORTSDB_KEY from your env" : `the free key "${apiKey()}"`}...\n`
);

let leagues;
try {
  if (raw) {
    console.log(JSON.stringify(await rawLookup(country, sport), null, 2));
    process.exit(0);
  }
  leagues = await searchLeagues(country, sport);
} catch (err) {
  // A stack trace here helps nobody: the realistic causes are no internet,
  // a proxy in the way, or the API being down.
  console.error(`TheSportsDB could not be reached: ${err.message ?? err}`);
  console.error(
    "\nCheck your internet connection, then try again. If you are behind a corporate proxy,\n" +
      "that is the usual culprit. The API itself is at https://www.thesportsdb.com/ ."
  );
  process.exit(1);
}

if (leagues.length === 0) {
  console.log(`No leagues found for country="${country}" sport="${sport}".`);
  console.log("\nThings to check, in order:");
  console.log('  1. Sport spelling — TheSportsDB uses "Soccer" (not Football), "Baseball", "Basketball".');
  console.log("  2. Country in English: Japan, England, Spain, ...");
  console.log("  3. Whether the API answered at all — re-run with --raw to see its actual response:");
  console.log(`       npm run sports-leagues -- ${country} ${sport} --raw`);
  console.log(
    "  4. If --raw shows an empty or error body, the free key may be rate limited. Get your own at\n" +
      "     https://www.thesportsdb.com/ and set SPORTSDB_KEY in .env.local."
  );
  process.exit(1);
}

console.log(`${leagues.length} league(s) for ${country} / ${sport}:\n`);
for (const l of leagues) {
  console.log(`  id=${l.id}  ${l.name}${l.alternate ? `  (${l.alternate})` : ""}`);
}

const category = sport.toLowerCase() === "baseball" ? "baseball" : sport.toLowerCase() === "soccer" ? "soccer" : "sports_other";
console.log(
  `\nSet this in .env.local (pick the leagues you want):\n` +
    `  SPORTS_API_PROVIDER=thesportsdb\n` +
    `  SPORTSDB_LEAGUES=[{"id":"${leagues[0].id}","name":"${leagues[0].name}","category":"${category}"}]`
);
