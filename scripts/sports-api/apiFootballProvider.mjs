// Real provider: API-Football (https://www.api-football.com/), part of
// API-SPORTS. Chosen because it covers J1 League fixtures — most
// football-data-style free APIs only cover European top leagues.
//
// Requires API_FOOTBALL_KEY (get one at api-football.com or via the
// RapidAPI listing; the free tier is ~100 requests/day, plenty for a
// once-a-day fixture/result sync). API_FOOTBALL_LEAGUE_ID defaults to 98
// (J1 League) and API_FOOTBALL_SEASON defaults to the current year —
// double-check both against API-Football's /leagues endpoint before
// relying on them, league/season IDs occasionally get renumbered.
//
// Activate with SPORTS_API_PROVIDER=api_football (see scripts/sports-api/index.mjs).

const BASE_URL = "https://v3.football.api-sports.io";

function requireKey() {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) {
    throw new Error(
      "API_FOOTBALL_KEY is not set. Get a free-tier key at https://www.api-football.com/ " +
        "and set it in .env.local, or set SPORTS_API_PROVIDER=mock to use the demo provider instead."
    );
  }
  return key;
}

async function apiFootballFetch(path, params) {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  console.log(`  -> GET ${url.pathname}?${url.searchParams}`);

  const res = await fetch(url, {
    headers: { "x-apisports-key": requireKey() },
  });
  if (!res.ok) {
    throw new Error(`API-Football request failed: ${res.status} ${res.statusText} (${url})`);
  }
  const body = await res.json();

  const remaining = res.headers.get("x-ratelimit-requests-remaining");
  if (remaining !== null) {
    console.log(`  <- ${body.results ?? 0} result(s); daily quota remaining: ${remaining}`);
  } else {
    console.log(`  <- ${body.results ?? 0} result(s)`);
  }

  // API-Football answers 200 OK even when it rejects the request, putting
  // the reason in `errors` — an empty/invalid key, or a season your plan
  // doesn't cover, both land here rather than as an HTTP error.
  const errors = body.errors ?? {};
  const hasErrors = Array.isArray(errors) ? errors.length > 0 : Object.keys(errors).length > 0;
  if (hasErrors) {
    throw new Error(
      `API-Football rejected the request: ${JSON.stringify(errors)}\n` +
        "  Common causes: an invalid API_FOOTBALL_KEY, or requesting a season your plan doesn't include " +
        "(the free plan only covers a fixed set of past seasons — check your dashboard and set " +
        "API_FOOTBALL_SEASON accordingly)."
    );
  }

  if ((body.results ?? 0) === 0) {
    console.warn(
      "  NOTE: the request succeeded but returned 0 results. Check API_FOOTBALL_LEAGUE_ID / " +
        "API_FOOTBALL_SEASON against https://v3.football.api-sports.io/leagues — a season your plan " +
        "does not cover, or an out-of-season date range, both come back empty rather than as an error."
    );
  }

  return body;
}

function mapFixture(raw) {
  const statusShort = raw.fixture?.status?.short;
  const finished = statusShort === "FT" || statusShort === "AET" || statusShort === "PEN";
  const postponed = statusShort === "PST";
  const cancelled = statusShort === "CANC" || statusShort === "ABD";

  return {
    externalRef: String(raw.fixture.id),
    homeTeam: raw.teams.home.name,
    awayTeam: raw.teams.away.name,
    kickoffTime: raw.fixture.date,
    competition: raw.league?.name ?? "J1 League",
    status: finished ? "finished" : postponed ? "postponed" : cancelled ? "cancelled" : "scheduled",
    homeScore: finished ? raw.goals.home : null,
    awayScore: finished ? raw.goals.away : null,
  };
}

export const apiFootballProvider = {
  name: "api_football",

  async listUpcomingFixtures(daysAhead) {
    const leagueId = process.env.API_FOOTBALL_LEAGUE_ID ?? "98";
    const season = process.env.API_FOOTBALL_SEASON ?? String(new Date().getFullYear());
    const from = new Date();
    const to = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
    const format = (d) => d.toISOString().slice(0, 10);

    const body = await apiFootballFetch("/fixtures", {
      league: leagueId,
      season,
      from: format(from),
      to: format(to),
    });

    return (body.response ?? []).map(mapFixture);
  },

  async getFixtureResult(externalRef) {
    const body = await apiFootballFetch("/fixtures", { id: externalRef });
    const raw = body.response?.[0];
    return raw ? mapFixture(raw) : null;
  },
};
