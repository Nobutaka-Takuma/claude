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

  const res = await fetch(url, {
    headers: { "x-apisports-key": requireKey() },
  });
  if (!res.ok) {
    throw new Error(`API-Football request failed: ${res.status} ${res.statusText} (${url})`);
  }
  const body = await res.json();
  if (Array.isArray(body.errors) ? body.errors.length > 0 : Object.keys(body.errors ?? {}).length > 0) {
    throw new Error(`API-Football returned errors: ${JSON.stringify(body.errors)}`);
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
