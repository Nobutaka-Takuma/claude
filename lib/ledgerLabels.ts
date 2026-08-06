// Japanese copy for every kind of ledger entry, in one place.
//
// The labels used to live in two page-local maps that had drifted apart,
// and anything missing fell through to the raw enum name — which is how
// "resolution_reward" ended up on a user's points history. Typing the maps
// against the enum union makes a missing label a compile error instead of
// an English word on someone's screen.
export type LedgerEntryType =
  | "task_reward"
  | "bet_placed"
  | "bet_payout"
  | "bet_refund"
  | "bet_cancelled"
  | "rake_collected"
  | "treasury_grant"
  | "signup_bonus"
  | "market_creation_fee"
  | "market_seed_payout"
  | "creator_fee"
  | "resolution_bond"
  | "resolution_bond_forfeited"
  | "resolution_reward"
  | "challenge_bond"
  | "challenge_bond_forfeited"
  | "bond_awarded"
  | "vote_reward"
  | "voter_rake_share"
  | "report_reward"
  | "market_fee_forfeited"
  | "adjustment";

// What the user sees on their own points history: written from their
// point of view ("returned to me", "I paid"), not the ledger's.
const USER_LABELS: Record<LedgerEntryType, string> = {
  task_reward: "タスク完了報酬",
  bet_placed: "予想にポイントを使用",
  bet_payout: "的中の配当",
  bet_refund: "中止による返金",
  bet_cancelled: "予想の取り消し（返金）",
  rake_collected: "マーケット手数料",
  treasury_grant: "運営からの付与",
  signup_bonus: "🎁 新規登録ボーナス",
  market_creation_fee: "マーケット作成料",
  market_seed_payout: "初期賞金の受け取り",
  creator_fee: "💰 マーケット作成者報酬",
  resolution_bond: "結果報告の保証金",
  resolution_bond_forfeited: "保証金の没収（報告が覆されたため）",
  resolution_reward: "📝 結果報告の報酬",
  challenge_bond: "異議申し立ての保証金",
  challenge_bond_forfeited: "保証金の没収（異議が退けられたため）",
  bond_awarded: "🏅 相手の保証金からの受け取り",
  vote_reward: "🗳 判定投票の報酬（先着）",
  voter_rake_share: "🗳 判定投票の報酬（手数料の分配）",
  report_reward: "🚩 通報の報酬",
  market_fee_forfeited: "作成料の没収（マーケットが停止されたため）",
  adjustment: "運営による補正",
};

// What the treasury dashboard shows: the same events seen from the
// community fund's side, where a payout to a user is an outflow.
const TREASURY_LABELS: Record<LedgerEntryType, string> = {
  task_reward: "労働報酬（広告視聴・アンケート）",
  bet_placed: "予想の預かり",
  bet_payout: "配当の払い出し",
  bet_refund: "中止による返金",
  bet_cancelled: "予想取り消しの手数料",
  rake_collected: "マーケット手数料",
  treasury_grant: "ユーザーへの付与",
  signup_bonus: "新規登録ボーナスの付与",
  market_creation_fee: "マーケット作成料",
  market_seed_payout: "初期賞金の払い出し",
  creator_fee: "マーケット作成者への分配",
  resolution_bond: "結果報告の保証金（預かり）",
  resolution_bond_forfeited: "報告者の保証金を没収",
  resolution_reward: "結果報告への報酬",
  challenge_bond: "異議申し立ての保証金（預かり）",
  challenge_bond_forfeited: "異議申立者の保証金を没収",
  bond_awarded: "保証金の勝者への引き渡し",
  vote_reward: "判定投票への報酬",
  voter_rake_share: "判定投票者への手数料分配",
  report_reward: "通報者への報酬",
  market_fee_forfeited: "停止されたマーケットの作成料を没収",
  adjustment: "補正",
};

// Bonds appear twice on a history — once going out, once coming back —
// and a single label for both leaves two identical rows differing only by
// a minus sign. The direction is in the amount, so put it in the words too.
const DIRECTIONAL: Partial<Record<LedgerEntryType, { out: string; back: string }>> = {
  resolution_bond: { out: "結果報告の保証金を預けました", back: "結果報告の保証金の返却" },
  challenge_bond: { out: "異議申し立ての保証金を預けました", back: "異議申し立ての保証金の返却" },
};

// Entries that record a fact rather than a movement: the points already
// left at deposit time, so the forfeit itself is 0pt. Written as a
// statement so "+0pt" doesn't have to carry the meaning.
const ZERO_DELTA_NOTES: Partial<Record<LedgerEntryType, string>> = {
  resolution_bond_forfeited: "保証金は返却されませんでした（報告が覆されたため）",
  challenge_bond_forfeited: "保証金は返却されませんでした（異議が退けられたため）",
  market_fee_forfeited: "作成料は返却されませんでした（マーケットが停止されたため）",
};

function lookup(map: Record<LedgerEntryType, string>, entryType: string): string {
  return map[entryType as LedgerEntryType] ?? "その他の増減";
}

export function userLedgerLabel(entryType: string, pointsDelta?: number): string {
  const note = ZERO_DELTA_NOTES[entryType as LedgerEntryType];
  if (note) return note;

  const directional = DIRECTIONAL[entryType as LedgerEntryType];
  if (directional && pointsDelta !== undefined) {
    return pointsDelta < 0 ? directional.out : directional.back;
  }
  return lookup(USER_LABELS, entryType);
}

const TREASURY_DIRECTIONAL: Partial<Record<LedgerEntryType, { in: string; out: string }>> = {
  resolution_bond: { in: "結果報告の保証金を預かり", out: "結果報告の保証金を返却" },
  challenge_bond: { in: "異議申し立ての保証金を預かり", out: "異議申し立ての保証金を返却" },
};

export function treasuryLedgerLabel(entryType: string, treasuryDelta?: number): string {
  const directional = TREASURY_DIRECTIONAL[entryType as LedgerEntryType];
  if (directional && treasuryDelta !== undefined) {
    return treasuryDelta > 0 ? directional.in : directional.out;
  }
  return lookup(TREASURY_LABELS, entryType);
}

// Money the fund actually earns, as opposed to money it is merely holding
// on someone's behalf (bonds, stakes) or that was put there by hand. A
// breakdown that counts custody as income says "補正 100%" and tells the
// community nothing about where its money comes from.
// (A forfeited bond is income too, but it enters the ledger as the
// original deposit and leaves as the winner's award, so it has no row of
// its own to count here.)
const REVENUE_TYPES = new Set<LedgerEntryType>([
  "task_reward",
  "rake_collected",
  "market_creation_fee",
  "bet_cancelled",
]);

export function isRevenueEntry(entryType: string): boolean {
  return REVENUE_TYPES.has(entryType as LedgerEntryType);
}
