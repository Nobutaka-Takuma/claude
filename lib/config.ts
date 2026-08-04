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

// Points locked up when a user proposes a market's result. Returned if
// the result survives the dispute window (or a DAO vote), forfeited to
// the treasury if the DAO overturns it. Set it high enough that lying
// costs more than a wrong settlement could pay the liar.
export const RESOLUTION_BOND = () => intFromEnv("RESOLUTION_BOND", 100);

// How long the community has to dispute a proposed result.
export const DISPUTE_WINDOW_MINUTES = () => intFromEnv("DISPUTE_WINDOW_MINUTES", 1440);
