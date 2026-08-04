import { query } from "./db";
import { syncMarketStatus, finalizeExpiredMarkets } from "./rpc";
import type {
  Bet,
  Challenge,
  Market,
  MarketPool,
  Task,
  Treasury,
  TreasuryLog,
  Vote,
} from "./types";

export async function getTreasury(): Promise<Treasury> {
  const result = await query<Treasury>("select * from treasury where id = 1");
  return result.rows[0];
}

export async function getActiveTasks(): Promise<Task[]> {
  const result = await query<Task>(
    `select * from tasks
     where is_active
       and (starts_at is null or starts_at <= now())
       and (ends_at is null or ends_at >= now())
     order by type, reward_points desc`
  );
  return result.rows;
}

export async function getUserVerifiedCompletionCounts(userId: string): Promise<Record<string, number>> {
  const result = await query<{ task_id: string; count: string }>(
    `select task_id, count(*) as count
     from task_completions
     where user_id = $1 and status = 'verified'
     group by task_id`,
    [userId]
  );
  return Object.fromEntries(result.rows.map((r) => [r.task_id, Number(r.count)]));
}

// Runs both lazy-cron sweeps: kickoff-based locking, then settlement of
// any provisional result or DAO vote whose window has closed. Called from
// every market read path instead of relying on a real scheduled job.
async function tickMarketLifecycle() {
  await syncMarketStatus();
  await finalizeExpiredMarkets();
}

export async function listMarkets(status?: string): Promise<Market[]> {
  await tickMarketLifecycle();
  const result = status
    ? await query<Market>(
        "select * from markets where status = $1 order by kickoff_time asc",
        [status]
      )
    : await query<Market>(
        "select * from markets where status <> 'proposed' order by kickoff_time asc"
      );
  return result.rows;
}

export async function getProposedMarkets(): Promise<Market[]> {
  const result = await query<Market>(
    "select * from markets where status = 'proposed' order by created_at desc"
  );
  return result.rows;
}

export async function getMarketById(id: string): Promise<Market | null> {
  await tickMarketLifecycle();
  const result = await query<Market>("select * from markets where id = $1", [id]);
  return result.rows[0] ?? null;
}

export async function getMarketPools(marketId: string): Promise<MarketPool[]> {
  const result = await query<MarketPool>(
    "select * from market_pools where market_id = $1",
    [marketId]
  );
  return result.rows;
}

export async function getProposalVoteCount(marketId: string): Promise<number> {
  const result = await query<{ count: string }>(
    "select count(*) as count from market_proposal_votes where market_id = $1",
    [marketId]
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function hasVotedOnProposal(marketId: string, userId: string): Promise<boolean> {
  const result = await query(
    "select 1 from market_proposal_votes where market_id = $1 and user_id = $2",
    [marketId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getUserBetForMarket(marketId: string, userId: string): Promise<Bet[]> {
  const result = await query<Bet>(
    "select * from bets where market_id = $1 and user_id = $2 order by placed_at desc",
    [marketId, userId]
  );
  return result.rows;
}

export type BetWithMarket = Bet & {
  title: string;
  home_team: string | null;
  away_team: string | null;
  status_market: string;
  market_kind: Market["market_kind"];
  outcome_options: Market["outcome_options"];
};

export async function getUserBets(userId: string): Promise<BetWithMarket[]> {
  const result = await query<BetWithMarket>(
    `select b.*, m.title, m.home_team, m.away_team, m.status as status_market,
            m.market_kind, m.outcome_options
     from bets b join markets m on m.id = b.market_id
     where b.user_id = $1
     order by b.placed_at desc
     limit 50`,
    [userId]
  );
  return result.rows;
}

export async function getUserTreasuryLogs(userId: string): Promise<TreasuryLog[]> {
  const result = await query<TreasuryLog>(
    "select * from treasury_logs where user_id = $1 order by created_at desc limit 50",
    [userId]
  );
  return result.rows;
}

export async function getRecentTreasuryLogs(limit = 20): Promise<TreasuryLog[]> {
  const result = await query<TreasuryLog>(
    "select * from treasury_logs order by created_at desc limit $1",
    [limit]
  );
  return result.rows;
}

export async function getTreasuryBreakdown(): Promise<{ entry_type: string; total: string }[]> {
  const result = await query<{ entry_type: string; total: string }>(
    `select entry_type, sum(greatest(treasury_delta, 0)) as total
     from treasury_logs
     where treasury_delta > 0
     group by entry_type
     order by total desc`
  );
  return result.rows;
}

export async function getChallengesForMarket(marketId: string): Promise<Challenge[]> {
  const result = await query<Challenge>(
    "select * from challenges where market_id = $1 order by created_at desc",
    [marketId]
  );
  return result.rows;
}

export async function getVotesForChallenge(challengeId: string): Promise<Vote[]> {
  const result = await query<Vote>(
    "select * from votes where challenge_id = $1",
    [challengeId]
  );
  return result.rows;
}
