import { mockProvider } from "./mockProvider.mjs";
import { apiFootballProvider } from "./apiFootballProvider.mjs";

const PROVIDERS = {
  mock: mockProvider,
  api_football: apiFootballProvider,
};

export function getProvider() {
  const name = process.env.SPORTS_API_PROVIDER ?? "mock";
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new Error(`Unknown SPORTS_API_PROVIDER "${name}". Valid values: ${Object.keys(PROVIDERS).join(", ")}`);
  }
  return provider;
}
