import type { QueryResultRow } from "pg";
import { query } from "./db";
import type { Bet, Challenge, Market, TreasuryLog } from "./types";

// Postgres surfaces `raise exception 'foo'` as error.message === 'foo', so
// these RPC wrappers just forward that text — route handlers map it to an
// HTTP status with rpcErrorStatus() below.
//
// `detail` carries the original Postgres text even when `message` has been
// normalised, so an error nobody anticipated still reaches the screen as
// something readable instead of a shrug.
export class RpcError extends Error {
  detail?: string;
  constructor(message: string, detail?: string) {
    super(message);
    this.detail = detail;
  }
}

// A pulled-but-not-migrated database is the single most common way this
// app breaks: the code calls a function or column that the local DB
// doesn't have yet, and Postgres answers with "function ... does not
// exist" — text that means nothing to someone who just ran `git pull`.
// Translating those three SQLSTATEs into one actionable code turns the
// mystery into an instruction.
const SCHEMA_MISMATCH_CODES = new Set([
  "42883", // undefined_function
  "42703", // undefined_column
  "42P01", // undefined_table
]);

async function callRpc<T extends QueryResultRow>(sql: string, params: unknown[]): Promise<T> {
  try {
    const result = await query<T>(sql, params);
    return result.rows[0];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string } | null)?.code;
    if (code && SCHEMA_MISMATCH_CODES.has(code)) {
      throw new RpcError("schema_out_of_date", message);
    }
    throw new RpcError(message, message);
  }
}

export function completeTask(
  userId: string,
  taskId: string,
  idempotencyKey: string,
  verification: unknown
) {
  return callRpc<TreasuryLog>("select * from complete_task($1, $2, $3, $4)", [
    userId,
    taskId,
    idempotencyKey,
    JSON.stringify(verification),
  ]);
}

export function placeBet(userId: string, marketId: string, outcome: string, amount: number) {
  return callRpc<Bet>("select * from place_bet($1, $2, $3, $4)", [
    userId,
    marketId,
    outcome,
    amount,
  ]);
}

// outcome is one of the market's own outcome_options keys, or 'void' to
// cancel the market and refund every active bet.
export function settleMarket(marketId: string, outcome: string) {
  return callRpc<Market>("select * from settle_market($1, $2)", [marketId, outcome]);
}

export interface ProposeMarketInput {
  userId: string;
  title: string;
  marketKind: "match_winner" | "binary" | "multi_outcome";
  kickoffTime: string;
  outcomeOptions: { key: string; label: string }[];
  description: string | null;
  category: string;
  homeTeam: string | null;
  awayTeam: string | null;
  resolvesAt: string;
  league: string | null;
  matchweek: number | null;
}

export function proposeMarket(input: ProposeMarketInput) {
  return callRpc<Market>(
    "select * from propose_market($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
    [
      input.userId,
      input.title,
      input.marketKind,
      input.kickoffTime,
      JSON.stringify(input.outcomeOptions),
      input.description,
      input.category,
      input.homeTeam,
      input.awayTeam,
      input.resolvesAt,
      input.league,
      input.matchweek,
    ]
  );
}

export interface CreateMarketInput {
  userId: string;
  title: string;
  marketKind: "match_winner" | "binary" | "multi_outcome";
  closesAt: string;
  outcomeOptions: { key: string; label: string }[];
  description: string | null;
  category: string;
  homeTeam: string | null;
  awayTeam: string | null;
  newsArticleId: string | null;
  creationCost: number;
  creatorFeeBps: number;
  resolvesAt: string | null;
  league: string | null;
  matchweek: number | null;
  seedBps: number;
  // Overrides the seed computed from creationCost. Used for admin
  // markets, which pay no fee but still get prize money from the
  // treasury.
  seedAmount?: number | null;
}

// Paid creation: charges creationCost and opens the market immediately,
// with the creator entitled to creatorFeeBps of its rake on settlement.
// (proposeMarket above is the free, vote-to-open alternative.)
export function createMarket(input: CreateMarketInput) {
  return callRpc<Market>(
    "select * from create_market($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)",
    [
      input.userId,
      input.title,
      input.marketKind,
      input.closesAt,
      JSON.stringify(input.outcomeOptions),
      input.description,
      input.category,
      input.homeTeam,
      input.awayTeam,
      input.newsArticleId,
      input.creationCost,
      input.creatorFeeBps,
      input.resolvesAt,
      input.league,
      input.matchweek,
      input.seedBps,
      input.seedAmount ?? null,
    ]
  );
}

export async function grantSignupBonus(userId: string, amount: number) {
  const result = await query<{ grant_signup_bonus: string }>(
    "select grant_signup_bonus($1, $2)",
    [userId, amount]
  );
  return Number(result.rows[0]?.grant_signup_bonus ?? 0);
}

export function voteMarketProposal(userId: string, marketId: string, threshold: number) {
  return callRpc<Market>("select * from vote_market_proposal($1, $2, $3)", [
    userId,
    marketId,
    threshold,
  ]);
}

// proposedBy null = operator/batch submission (no bond). A real user
// proposing posts `bond` points, returned if the result stands and
// forfeited if a DAO vote overturns it.
export function submitProvisionalResult(
  marketId: string,
  outcome: string,
  disputeWindowMinutes: number,
  proposedBy: string | null = null,
  bond = 0,
  evidenceUrl: string | null = null
) {
  return callRpc<Market>("select * from submit_provisional_result($1, $2, $3, $4, $5, $6)", [
    marketId,
    outcome,
    disputeWindowMinutes,
    proposedBy,
    bond,
    evidenceUrl,
  ]);
}

export function cancelBet(userId: string, betId: string, penalty: number) {
  return callRpc<Bet>("select * from cancel_bet($1, $2, $3)", [userId, betId, penalty]);
}

// Freezes betting on a market whose result is already known and puts the
// proposed outcome straight to a short DAO vote, skipping the optimistic
// window (the whole point is that this can't wait for kickoff).
export function requestEarlyResolution(
  userId: string,
  marketId: string,
  outcome: string,
  bond: number,
  votingHours: number
) {
  return callRpc<Challenge>("select * from request_early_resolution($1, $2, $3, $4, $5)", [
    userId,
    marketId,
    outcome,
    bond,
    votingHours,
  ]);
}

export function raiseChallenge(
  userId: string,
  marketId: string,
  reason: string,
  evidenceUrl: string | null,
  bond: number,
  votingHours: number
) {
  return callRpc<Challenge>("select * from raise_challenge($1, $2, $3, $4, $5, $6)", [
    userId,
    marketId,
    reason,
    evidenceUrl,
    bond,
    votingHours,
  ]);
}

export async function syncMarketStatus() {
  await query("select sync_market_status()");
}

// Lazy-cron counterpart to sync_market_status: settles any
// pending_resolution market whose dispute window closed uncontested, and
// tallies + settles any disputed market whose DAO voting_deadline closed.
export async function finalizeExpiredMarkets(bondAwardBps: number, resolutionReward: number) {
  await query("select finalize_expired_markets($1, $2)", [bondAwardBps, resolutionReward]);
}

// Community takedown: a report that reaches the threshold performs the
// removal in the same transaction, so the returned market already carries
// its banned state.
export function reportMarket(
  userId: string,
  marketId: string,
  category: string,
  note: string | null,
  threshold: number,
  rewardPerReporter: number
) {
  return callRpc<Market>("select * from report_market($1, $2, $3, $4, $5, $6)", [
    userId,
    marketId,
    category,
    note,
    threshold,
    rewardPerReporter,
  ]);
}

export function banMarket(marketId: string, reason: string | null, rewardPerReporter: number) {
  return callRpc<Market>("select * from ban_market($1, $2, $3)", [
    marketId,
    reason,
    rewardPerReporter,
  ]);
}

export function dismissMarketReports(marketId: string) {
  return callRpc<Market>("select * from dismiss_market_reports($1)", [marketId]);
}

export function rpcErrorStatus(message: string): number {
  // The request was fine; the deployment is behind. 503 rather than 4xx so
  // it doesn't read as the user's mistake.
  if (message === "schema_out_of_date") return 503;
  if (
    message.includes("insufficient") ||
    message.includes("already_bet_other_outcome") ||
    message.includes("already_challenged") ||
    message.includes("bet_not_active") ||
    message.includes("invalid_outcome_options") ||
    message.includes("invalid_outcome_key") ||
    message.includes("not_open") ||
    message.includes("not_awaiting_result") ||
    message.includes("inactive") ||
    message.includes("invalid_outcome") ||
    message.includes("invalid_market_kind") ||
    message.includes("home_away_required") ||
    message.includes("duplicate_outcome_keys") ||
    message.includes("reserved_outcome_key") ||
    message.includes("kickoff_must_be_future")
  ) {
    return 422;
  }
  if (message.includes("duplicate") || message.includes("limit_reached") || message.includes("already")) {
    return 409;
  }
  if (message.includes("not_found")) return 404;
  return 400;
}
