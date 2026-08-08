import { mockProvider } from "./mockProvider.mjs";
import { apiFootballProvider } from "./apiFootballProvider.mjs";
import { theSportsDbProvider } from "./theSportsDbProvider.mjs";

const PROVIDERS = {
  mock: mockProvider,
  api_football: apiFootballProvider,
  thesportsdb: theSportsDbProvider,
};

export function getProvider() {
  const configured = process.env.SPORTS_API_PROVIDER;
  const hasKey = Boolean(process.env.API_FOOTBALL_KEY);

  // Same reasoning as the API-Football branch below: configuring leagues
  // and then getting fake fixtures is a confusing way to spend an
  // afternoon.
  if (!configured && process.env.SPORTSDB_LEAGUES) {
    console.log('SPORTS_API_PROVIDER is unset but SPORTSDB_LEAGUES is present — using the "thesportsdb" provider.');
    return theSportsDbProvider;
  }
  if (configured === "mock" && process.env.SPORTSDB_LEAGUES) {
    console.warn(
      'WARNING: SPORTSDB_LEAGUES is set, but SPORTS_API_PROVIDER="mock", so this run will generate FAKE fixtures.\n' +
        "         Set SPORTS_API_PROVIDER=thesportsdb to fetch real matches."
    );
  }

  // Setting a key but leaving SPORTS_API_PROVIDER at its "mock" default is
  // the easiest way to end up staring at fake fixtures and wondering why
  // real matches never show up — so a key alone is enough to switch over.
  if (!configured) {
    if (hasKey) {
      console.log('SPORTS_API_PROVIDER is unset but API_FOOTBALL_KEY is present — using the "api_football" provider.');
      return apiFootballProvider;
    }
    return mockProvider;
  }

  if (configured === "mock" && hasKey) {
    console.warn(
      'WARNING: API_FOOTBALL_KEY is set, but SPORTS_API_PROVIDER="mock", so this run will generate FAKE fixtures.\n' +
        '         Set SPORTS_API_PROVIDER=api_football in .env.local to fetch real matches.'
    );
  }

  const provider = PROVIDERS[configured];
  if (!provider) {
    throw new Error(`Unknown SPORTS_API_PROVIDER "${configured}". Valid values: ${Object.keys(PROVIDERS).join(", ")}`);
  }
  return provider;
}
