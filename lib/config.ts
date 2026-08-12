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

// What it costs to open a market instantly, and the creator's share of
// that market's rake when it settles.
//
// 0 の間はマーケット作成が無料になる。「作られないより乱立するほうがまし」
// という判断で一時的に下げているもので、本来はスパム対策の関門なので、
// 人が集まったら戻す前提の数字。
//
// 副作用に注意: 初期賞金は作成料から出る（MARKET_SEED_BPS）ので、0 にすると
// 初期賞金も 0 になる。stake-back 保証があるため賭けた人が損をすることは
// ないが、反対側に誰もいないマーケットは「増えも減りもしない」で終わる。
export const MARKET_CREATION_COST = () => intFromEnv("MARKET_CREATION_COST", 0);
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
// 10pt では「保証金100ptを預けて、証跡を探して報告する」割に合わなかった。
// 報告されないマーケットは誰の得にもならないので、保証金と同額まで上げて
// いる（当たれば預けた分が戻り、さらに同額が乗る）。
export const RESOLUTION_REWARD = () => intFromEnv("RESOLUTION_REWARD", 100);

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
// 3pt では投票する理由にならず、異議申し立ての投票が集まらなかった。
// 判定に人が集まらないと、そのマーケットの精算自体が止まる。
export const VOTE_FLAT_REWARD = () => intFromEnv("VOTE_FLAT_REWARD", 30);
export const VOTE_REWARD_SLOTS = () => intFromEnv("VOTE_REWARD_SLOTS", 10);

// Cancelling a bet before the market closes costs this much, so it isn't
// a free option on every swing in the odds.
export const BET_CANCEL_PENALTY = () => intFromEnv("BET_CANCEL_PENALTY", 3);

// Reports needed to remove a market that violates the guidelines, and
// what each reporter earns from the creator's forfeited fee.
//
// The threshold is the safety-vs-abuse dial: too high and a market that
// shouldn't exist stays up while people bet on it; too low and a handful
// of accounts can destroy legitimate markets. Raise it as the user base
// grows — three is right for a small community where three independent
// people flagging something is a real signal.
export const MARKET_BAN_THRESHOLD = () => intFromEnv("MARKET_BAN_THRESHOLD", 3);
// 通報の報酬も同じ理由で引き上げる。作成料が0の間は没収する原資がないので、
// これは金庫からの持ち出しになる（ban_market は元々金庫から払っている）。
export const REPORT_REWARD = () => intFromEnv("REPORT_REWARD", 30);

// --- マイクロワーク（スポンサー案件）---

function floatFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// 1ptを何円とみなすか。案件を作るときの既定値で、そのまま原価計算に使う。
// ポイントは換金できないので実際の債務ではないが、この数字を決めないと
// 「1件80円もらって120pt配る」逆ざやの案件が見えないまま増える。
export const POINT_VALUE_YEN = () => floatFromEnv("POINT_VALUE_YEN", 1.0);

// 相互チェックで支払いに必要な賛成数と、チェック1件あたりの報酬の既定値。
// チェックを無償にすると誰もやらず、保留が溜まるだけで終わる。
export const MICRO_WORK_QUORUM = () => intFromEnv("MICRO_WORK_QUORUM", 3);
export const PEER_REVIEW_REWARD = () => intFromEnv("PEER_REVIEW_REWARD", 2);

// 受注額のうち、ユーザーへの報酬に回す割合（6000 bps = 60%）。管理画面で
// 案件を作るときに報酬ポイントの目安として提示するだけで、強制はしない。
// 残りが運営の取り分＝サーバー代・審査の手間・金庫への積み立てになる。
export const WORK_PAYOUT_RATIO_BPS = () => intFromEnv("WORK_PAYOUT_RATIO_BPS", 6000);
