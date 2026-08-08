// Prints TheSportsDB league IDs for a country, so nobody has to guess
// them or copy one out of a stale blog post.
//
//   npm run sports-leagues -- Japan Soccer
//   npm run sports-leagues -- Japan Baseball
//
// Paste the ids you want into SPORTSDB_LEAGUES, e.g.
//   SPORTSDB_LEAGUES=[{"id":"4363","name":"J1リーグ","category":"soccer"}]
import { searchLeagues } from "./sports-api/theSportsDbProvider.mjs";

const [country = "Japan", sport = "Soccer"] = process.argv.slice(2);

const leagues = await searchLeagues(country, sport);
if (leagues.length === 0) {
  console.log(`No leagues found for country="${country}" sport="${sport}".`);
  console.log('Sport must be one of TheSportsDB\'s names: Soccer, Baseball, Basketball, ...');
} else {
  console.log(`${leagues.length} league(s) for ${country} / ${sport}:\n`);
  for (const l of leagues) {
    console.log(`  id=${l.id}  ${l.name}${l.alternate ? `  (${l.alternate})` : ""}`);
  }
  console.log(
    `\nExample:\n  SPORTSDB_LEAGUES=[{"id":"${leagues[0].id}","name":"${leagues[0].name}","category":"${
      sport.toLowerCase() === "baseball" ? "baseball" : "soccer"
    }"}]`
  );
}
