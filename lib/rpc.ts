import type { QueryResultRow } from "pg";
import { query } from "./db";
import type { Bet, Market, TreasuryLog } from "./types";

// Postgres surfaces `raise exception 'foo'` as error.message === 'foo', so
// these RPC wrappers just forward that text — route handlers map it to an
// HTTP status with rpcErrorStatus() below.
export class RpcError extends Error {}

async function callRpc<T extends QueryResultRow>(sql: string, params: unknown[]): Promise<T> {
  try {
    const result = await query<T>(sql, params);
    return result.rows[0];
  } catch (err) {
    throw new RpcError(err instanceof Error ? err.message : String(err));
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
}

export function proposeMarket(input: ProposeMarketInput) {
  return callRpc<Market>(
    "select * from propose_market($1, $2, $3, $4, $5, $6, $7, $8, $9)",
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
}

// Paid creation: charges creationCost and opens the market immediately,
// with the creator entitled to creatorFeeBps of its rake on settlement.
// (proposeMarket above is the free, vote-to-open alternative.)
export function createMarket(input: CreateMarketInput) {
  return callRpc<Market>(
    "select * from create_market($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
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
  bond = 0
) {
  return callRpc<Market>("select * from submit_provisional_result($1, $2, $3, $4, $5)", [
    marketId,
    outcome,
    disputeWindowMinutes,
    proposedBy,
    bond,
  ]);
}

export async function syncMarketStatus() {
  await query("select sync_market_status()");
}

// Lazy-cron counterpart to sync_market_status: settles any
// pending_resolution market whose dispute window closed uncontested, and
// tallies + settles any disputed market whose DAO voting_deadline closed.
export async function finalizeExpiredMarkets() {
  await query("select finalize_expired_markets()");
}

export function rpcErrorStatus(message: string): number {
  if (
    message.includes("insufficient") ||
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
