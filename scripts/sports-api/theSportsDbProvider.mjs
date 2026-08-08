// TheSportsDB (https://www.thesportsdb.com/) — the fixture source this
// app actually recommends.
//
// Why not scrape a schedule page: the obvious candidates (Yahoo!スポーツナビ
// and friends) forbid automated collection in their terms, render their
// schedules with JavaScript so there is nothing useful in the HTML, and
// change that markup whenever they feel like it. A scraper would be
// against the rules on day one and broken by the end of the month.
//
// TheSportsDB is a community-maintained sports database with a documented
// free API, and unlike most free football APIs it covers Japanese leagues
// — J1/J2/J3, NPB, B.League — which is the whole reason it's here.
//
// Configuration:
//   SPORTS_API_PROVIDER=thesportsdb
//   SPORTSDB_KEY=...            free key from thesportsdb.com (defaults to
//                               the public test key "3", heavily rate
//                               limited — fine for trying it out)
//   SPORTSDB_LEAGUES=[{"id":"4363","name":"J1リーグ","category":"soccer"}]
//
// League IDs are not guessable and do get renumbered, so don't take any
// from a blog post. Run the built-in lookup instead:
//   npm run sports-leagues -- Japan Soccer
// and paste what it prints into SPORTSDB_LEAGUES.

const BASE_URL = "https://www.thesportsdb.com/api/v1/json";

function apiKey() {
  return process.env.SPORTSDB_KEY || "3";
}

// Deliberately empty by default. Shipping guessed league IDs would mean
// silently syncing the wrong competition — or nothing at all — with no
// clue as to why, so an unconfigured provider says so instead.
export function getConfiguredLeagues() {
  const raw = process.env.SPORTSDB_LEAGUES;
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `SPORTSDB_LEAGUES is not valid JSON. Expected e.g. ` +
        `[{"id":"4363","name":"J1リーグ","category":"soccer"}]`
    );
  }
  if (!Array.isArray(parsed)) throw new Error("SPORTSDB_LEAGUES must be a JSON array.");
  for (const l of parsed) {
    if (!l?.id) throw new Error(`Every SPORTSDB_LEAGUES entry needs an "id": ${JSON.stringify(l)}`);
  }
  return parsed.map((l) => ({
    id: String(l.id),
    name: l.name ?? null,
    category: l.category ?? "sports_other",
  }));
}

async function sportsDbFetch(path, params = {}) {
  const url = new URL(`${BASE_URL}/${apiKey()}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(
      `TheSportsDB request failed: ${res.status} ${res.statusText} (${url.pathname}). ` +
        (res.status === 429
          ? "The public test key is rate limited — get a free key at thesportsdb.com and set SPORTSDB_KEY."
          : "")
    );
  }
  return res.json();
}

// Prints the league IDs for a country so nobody has to guess them.
export async function searchLeagues(country = "Japan", sport = "Soccer") {
  const body = await sportsDbFetch("search_all_leagues.php", { c: country, s: sport });
  return (body?.countrys ?? []).map((l) => ({
    id: l.idLeague,
    name: l.strLeague,
    alternate: l.strLeagueAlternate ?? null,
  }));
}

// TheSportsDB returns dates and times separately, in UTC.
function toKickoffIso(event) {
  if (event.strTimestamp) {
    const parsed = new Date(
      /[zZ]|[+-]\d{2}:?\d{2}$/.test(event.strTimestamp) ? event.strTimestamp : `${event.strTimestamp}Z`
    );
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  const date = event.dateEvent;
  const time = event.strTime && event.strTime !== "00:00:00" ? event.strTime : "12:00:00";
  if (!date) return null;
  const parsed = new Date(`${date}T${time}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export const theSportsDbProvider = {
  name: "thesportsdb",

  async listUpcomingFixtures(daysAhead) {
    const leagues = getConfiguredLeagues();
    if (leagues.length === 0) {
      throw new Error(
        "SPORTSDB_LEAGUES is not set, so there is nothing to fetch. Find the IDs with " +
          '`npm run sports-leagues -- Japan Soccer` and set e.g. ' +
          'SPORTSDB_LEAGUES=[{"id":"4363","name":"J1リーグ","category":"soccer"}]'
      );
    }

    const cutoff = Date.now() + daysAhead * 24 * 60 * 60 * 1000;
    const fixtures = [];

    for (const league of leagues) {
      // eventsnextleague returns the next 15 scheduled events for a
      // league — exactly "what's coming up", which is what this is for.
      const body = await sportsDbFetch("eventsnextleague.php", { id: league.id });
      const events = body?.events ?? [];
      console.log(`  <- league ${league.id} (${league.name ?? "?"}): ${events.length} event(s)`);

      for (const event of events) {
        const kickoffTime = toKickoffIso(event);
        if (!kickoffTime) continue;
        const at = new Date(kickoffTime).getTime();
        if (at <= Date.now() || at > cutoff) continue;
        if (!event.strHomeTeam || !event.strAwayTeam) continue;

        fixtures.push({
          // Prefixed so these can never collide with another provider's
          // ids in markets.external_ref.
          externalRef: `thesportsdb:${event.idEvent}`,
          homeTeam: event.strHomeTeam,
          awayTeam: event.strAwayTeam,
          kickoffTime,
          status: "scheduled",
          league: league.name ?? event.strLeague ?? null,
          category: league.category,
          matchweek: event.intRound ? Number(event.intRound) || null : null,
        });
      }
    }

    return fixtures;
  },

  async fetchResult(externalRef) {
    const id = externalRef.replace(/^thesportsdb:/, "");
    const body = await sportsDbFetch("lookupevent.php", { id });
    const event = body?.events?.[0];
    if (!event) return null;
    if (event.strStatus !== "Match Finished" && event.strStatus !== "FT") return null;

    const home = Number(event.intHomeScore);
    const away = Number(event.intAwayScore);
    if (Number.isNaN(home) || Number.isNaN(away)) return null;

    return {
      status: "finished",
      homeScore: home,
      awayScore: away,
      outcome: home > away ? "home" : home < away ? "away" : "draw",
    };
  },
};
