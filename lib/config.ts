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

// Share of the creation fee that becomes seeded prize money for the
// market's winners (9000 bps = 90%), rather than being kept by the
// treasury. Without a seed, the first bet on a market can only ever
// break even, so nobody has a reason to place it.
export const MARKET_SEED_BPS = () => intFromEnv("MARKET_SEED_BPS", 9000);

// Approval votes a *free* proposal needs before it opens for betting.
export const MARKET_APPROVAL_THRESHOLD = () => intFromEnv("MARKET_APPROVAL_THRESHOLD", 3);

// Prize money the treasury puts up for a market an admin opens. Admins
// pay no creation fee, so without this an operator-seeded market would
// open with an empty pot and nobody would have a reason to bet first.
export const ADMIN_MARKET_SEED = () => intFromEnv("ADMIN_MARKET_SEED", 90);

// Points locked up when a user proposes a market's result. Returned if
// the result survives the dispute window (or a DAO vote), forfeited to
// the treasury if the DAO overturns it. Set it high enough that lying
// costs more than a wrong settlement could pay the liar.
export const RESOLUTION_BOND = () => intFromEnv("RESOLUTION_BOND", 100);

// Paid to whoever reported the result, on top of their returned bond,
// once it survives the dispute window or the vote. Getting the bond back
// is not an incentive — it's what happens if you do nothing — so this is
// the actual wage for checking a source and reporting it. Funded by the
// slice of each market's creation fee the treasury keeps.
export const RESOLUTION_REWARD = () => intFromEnv("RESOLUTION_REWARD", 10);

// How long the community has to dispute a proposed result.
export const DISPUTE_WINDOW_MINUTES = () => intFromEnv("DISPUTE_WINDOW_MINUTES", 1440);

// Filing a dispute costs the same as proposing, so contesting a result
// is a claim you back rather than a free way to stall a settlement.
export const CHALLENGE_BOND = () => intFromEnv("CHALLENGE_BOND", 100);
export const CHALLENGE_VOTING_HOURS = () => intFromEnv("CHALLENGE_VOTING_HOURS", 24);

// When a result is already known before betting closes, anyone can pay a
// bond to freeze the market and put the outcome to a short vote.
export const EARLY_RESOLUTION_BOND = () => intFromEnv("EARLY_RESOLUTION_BOND", 100);
export const EARLY_RESOLUTION_VOTING_HOURS = () => intFromEnv("EARLY_RESOLUTION_VOTING_HOURS", 3);

// Share of the loser's forfeited bond handed to whoever was right; the
// remainder stays with the treasury.
export const BOND_AWARD_BPS = () => intFromEnv("BOND_AWARD_BPS", 7000);

// Voting rewards: correct voters split this share of the rake, and the
// first N of them also get a flat bonus.
export const VOTER_RAKE_SHARE_BPS = () => intFromEnv("VOTER_RAKE_SHARE_BPS", 5000);
export const VOTE_FLAT_REWARD = () => intFromEnv("VOTE_FLAT_REWARD", 3);
export const VOTE_REWARD_SLOTS = () => intFromEnv("VOTE_REWARD_SLOTS", 10);

// Cancelling a bet before the market closes costs this much, so it isn't
// a free option on every swing in the odds.
export const BET_CANCEL_PENALTY = () => intFromEnv("BET_CANCEL_PENALTY", 3);
