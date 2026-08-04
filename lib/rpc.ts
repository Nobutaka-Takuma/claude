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

export function placeBet(
  userId: string,
  marketId: string,
  outcome: "home" | "away" | "draw",
  amount: number
) {
  return callRpc<Bet>("select * from place_bet($1, $2, $3, $4)", [
    userId,
    marketId,
    outcome,
    amount,
  ]);
}

export function settleMarket(marketId: string, outcome: "home" | "away" | "draw" | "void") {
  return callRpc<Market>("select * from settle_market($1, $2)", [marketId, outcome]);
}

export function proposeMarket(
  userId: string,
  title: string,
  homeTeam: string,
  awayTeam: string,
  kickoffTime: string,
  description: string | null,
  category: string
) {
  return callRpc<Market>(
    "select * from propose_market($1, $2, $3, $4, $5, $6, $7)",
    [userId, title, homeTeam, awayTeam, kickoffTime, description, category]
  );
}

export function voteMarketProposal(userId: string, marketId: string, threshold: number) {
  return callRpc<Market>("select * from vote_market_proposal($1, $2, $3)", [
    userId,
    marketId,
    threshold,
  ]);
}

export async function syncMarketStatus() {
  await query("select sync_market_status()");
}

export function rpcErrorStatus(message: string): number {
  if (message.includes("duplicate") || message.includes("limit_reached") || message.includes("already")) {
    return 409;
  }
  if (message.includes("not_found")) return 404;
  if (message.includes("insufficient") || message.includes("not_open") || message.includes("inactive")) {
    return 422;
  }
  return 400;
}
