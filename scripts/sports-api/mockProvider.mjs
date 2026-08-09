// Deterministic fake fixture provider for local dev/demo — no API key
// needed. Used by default (SPORTS_API_PROVIDER unset or "mock") so
// scripts/sync-fixtures.mjs and scripts/sync-results.mjs are runnable and
// demonstrable out of the box. Swap to the real apiFootballProvider by
// setting SPORTS_API_PROVIDER=api_football once a key is configured.

// Prefixed so a mock fixture that somehow reaches a real database is
// obvious on sight. These are invented matchups; using bare club names
// made them indistinguishable from a real schedule.
const TEAM_POOL = [
  "[デモ]浦和", "[デモ]鹿島", "[デモ]FC東京", "[デモ]川崎",
  "[デモ]横浜FM", "[デモ]G大阪", "[デモ]C大阪", "[デモ]名古屋",
  "[デモ]神戸", "[デモ]広島", "[デモ]福岡", "[デモ]札幌",
];

// Small stable hash so a given externalRef always maps to the same
// "random" score — repeated syncs stay idempotent instead of flip-flopping.
function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function fixtureAt(index, kickoffTime) {
  const home = TEAM_POOL[index % TEAM_POOL.length];
  const away = TEAM_POOL[(index + 3) % TEAM_POOL.length];
  return {
    externalRef: `mock-j1-${index}`,
    homeTeam: home,
    awayTeam: away === home ? TEAM_POOL[(index + 5) % TEAM_POOL.length] : away,
    kickoffTime,
    competition: "J1リーグ（モック）",
  };
}

export const mockProvider = {
  name: "mock",

  async listUpcomingFixtures(daysAhead) {
    const fixtures = [];
    const count = Math.max(1, Math.min(daysAhead, 10));
    for (let i = 0; i < count; i++) {
      const kickoff = new Date(Date.now() + (i + 1) * 24 * 60 * 60 * 1000);
      const { externalRef, homeTeam, awayTeam } = fixtureAt(i, kickoff.toISOString());
      fixtures.push({
        externalRef,
        homeTeam,
        awayTeam,
        kickoffTime: kickoff.toISOString(),
        competition: "J1リーグ（モック）",
        status: "scheduled",
        homeScore: null,
        awayScore: null,
      });
    }
    return fixtures;
  },

  async getFixtureResult(externalRef) {
    const index = Number(externalRef.replace("mock-j1-", ""));
    if (Number.isNaN(index)) return null;

    const { homeTeam, awayTeam } = fixtureAt(index, "");
    const h = hash(externalRef);
    const homeScore = h % 4;
    const awayScore = Math.floor(h / 4) % 4;

    return {
      externalRef,
      homeTeam,
      awayTeam,
      kickoffTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      competition: "J1リーグ（モック）",
      status: "finished",
      homeScore,
      awayScore,
    };
  },
};
