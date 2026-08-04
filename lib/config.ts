// Economy knobs, all overridable per-deployment via env.
function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Points a brand-new account receives from the treasury so it can
// participate immediately instead of having to grind tasks first.
export const SIGNUP_BONUS_POINTS = () => intFromEnv("SIGNUP_BONUS_POINTS", 1000);

// What it costs to open a market instantly (the anti-spam gate), and the
// creator's share of that market's rake when it settles.
export const MARKET_CREATION_COST = () => intFromEnv("MARKET_CREATION_COST", 100);
export const MARKET_CREATOR_FEE_BPS = () => intFromEnv("MARKET_CREATOR_FEE_BPS", 1000);

// Approval votes a *free* proposal needs before it opens for betting.
export const MARKET_APPROVAL_THRESHOLD = () => intFromEnv("MARKET_APPROVAL_THRESHOLD", 3);
