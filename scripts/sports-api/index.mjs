import { mockProvider } from "./mockProvider.mjs";
import { apiFootballProvider } from "./apiFootballProvider.mjs";

const PROVIDERS = {
  mock: mockProvider,
  api_football: apiFootballProvider,
};

export function getProvider() {
  const configured = process.env.SPORTS_API_PROVIDER;
  const hasKey = Boolean(process.env.API_FOOTBALL_KEY);

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
