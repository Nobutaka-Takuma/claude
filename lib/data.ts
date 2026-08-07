import { query } from "./db";
import { syncMarketStatus, finalizeExpiredMarkets } from "./rpc";
import { BOND_AWARD_BPS, RESOLUTION_REWARD } from "./config";
import type {
  Bet,
  Challenge,
  Comment,
  Market,
  MarketPool,
  NewsArticle,
  NewsFeedItem,
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
  await finalizeExpiredMarkets(BOND_AWARD_BPS(), RESOLUTION_REWARD());
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

export async function getNewsArticleById(id: string): Promise<NewsArticle | null> {
  const result = await query<NewsArticle>("select * from news_articles where id = $1", [id]);
  return result.rows[0] ?? null;
}

export interface MarketSearchFilters {
  statuses: string[];
  category?: string | null;
  league?: string | null;
  matchweek?: number | null;
  q?: string | null;
}

// Plain ILIKE rather than full-text search: Postgres's built-in text
// search doesn't tokenise Japanese, so a tsvector index would match on
// whole strings only and be worse than a substring scan. At this scale a
// sequential scan is fine; if the market count grows, the answer is
// pg_trgm + a GIN index (or a dedicated search service), not tsvector.
export async function searchMarkets(filters: MarketSearchFilters): Promise<Market[]> {
  await tickMarketLifecycle();

  const conditions: string[] = ["status = any($1)"];
  const params: unknown[] = [filters.statuses];

  if (filters.category) {
    params.push(filters.category);
    conditions.push(`category = $${params.length}`);
  }
  if (filters.league) {
    params.push(filters.league);
    conditions.push(`league = $${params.length}`);
  }
  if (filters.matchweek) {
    params.push(filters.matchweek);
    conditions.push(`matchweek = $${params.length}`);
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    const p = `$${params.length}`;
    conditions.push(
      `(title ilike ${p} or coalesce(description,'') ilike ${p} or coalesce(home_team,'') ilike ${p}
        or coalesce(away_team,'') ilike ${p} or coalesce(league,'') ilike ${p})`
    );
  }

  const result = await query<Market>(
    `select * from markets where ${conditions.join(" and ")} order by kickoff_time asc`,
    params
  );
  return result.rows;
}

export type VotingTask = Market & { challenge_id: string; vote_count: string; voting_deadline: string };

// Resolution votes that still need voters, surfaced in the task centre.
//
// The reward goes to the first N *correct* voters, which nobody can know
// while the vote is running — so the listing threshold is total votes
// cast. Once enough people have weighed in, the vote stops being
// advertised as a task even though it's still open.
export async function getOpenVotingTasks(
  userId: string | null,
  voteThreshold: number
): Promise<VotingTask[]> {
  await tickMarketLifecycle();
  const result = await query<VotingTask>(
    `select m.*, c.id as challenge_id, c.voting_deadline,
            (select count(*) from votes v where v.challenge_id = c.id) as vote_count
     from challenges c
     join markets m on m.id = c.market_id
     where c.status = 'open'
       and c.voting_deadline > now()
       and (select count(*) from votes v where v.challenge_id = c.id) < $2
       and ($1::uuid is null or not exists (
         select 1 from votes v where v.challenge_id = c.id and v.user_id = $1
       ))
     order by c.voting_deadline asc`,
    [userId, voteThreshold]
  );
  return result.rows;
}

// Markets whose scheduled resolution time has arrived and that still
// have nobody's result on them, surfaced in the task centre.
//
// resolves_at is the whole point of the field: it's the moment the answer
// is supposed to be knowable, so it's when the work of reporting becomes
// claimable. Markets locked long ago with no reported result show up too
// (resolves_at is never null since 0013), so nothing gets stranded.
export async function getOpenResolutionTasks(limit = 20): Promise<Market[]> {
  await tickMarketLifecycle();
  const result = await query<Market>(
    `select * from markets
     where status = 'locked'
       and resolves_at is not null
       and resolves_at <= now()
     order by resolves_at asc
     limit $1`,
    [limit]
  );
  return result.rows;
}

// Markets a bettor on this one is likely to also care about, ranked by
// how closely they relate: same news story first (they're literally about
// the same event), then same league round, then same league, then same
// category. Only open markets, since the point is to offer another bet.
export async function getRelatedMarkets(market: Market, limit = 4): Promise<Market[]> {
  const result = await query<Market>(
    `select *,
       case
         when $2::uuid is not null and news_article_id = $2 then 0
         when $3::text is not null and league = $3 and matchweek is not distinct from $4 then 1
         when $3::text is not null and league = $3 then 2
         else 3
       end as relevance
     from markets
     where id <> $1
       and status = 'open'
       and (
         ($2::uuid is not null and news_article_id = $2)
         or ($3::text is not null and league = $3)
         or category = $5
       )
     order by relevance, kickoff_time asc
     limit $6`,
    [market.id, market.news_article_id, market.league, market.matchweek, market.category, limit]
  );
  return result.rows;
}

// Distinct league/matchweek pairs actually present, for the filter chips.
export async function getLeagueFacets(
  statuses: string[]
): Promise<{ league: string; matchweek: number | null; count: string }[]> {
  const result = await query<{ league: string; matchweek: number | null; count: string }>(
    `select league, matchweek, count(*) as count
     from markets
     where league is not null and status = any($1)
     group by league, matchweek
     order by league, matchweek nulls first`,
    [statuses]
  );
  return result.rows;
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
  resolves_at: string | null;
  kickoff_time: string;
};

export async function getUserBets(userId: string): Promise<BetWithMarket[]> {
  // Sweep first: without it a market whose kickoff has passed still reads
  // as 'open' here until some other page happens to lock it, and this
  // page decides whether to offer the cancel button.
  await tickMarketLifecycle();
  const result = await query<BetWithMarket>(
    `select b.*, m.title, m.home_team, m.away_team, m.status as status_market,
            m.market_kind, m.outcome_options, m.resolves_at, m.kickoff_time
     from bets b join markets m on m.id = b.market_id
     where b.user_id = $1
     order by b.placed_at desc
     limit 50`,
    [userId]
  );
  return result.rows;
}

export type TreasuryLogWithContext = TreasuryLog & {
  market_id: string | null;
  market_title: string | null;
  home_team: string | null;
  away_team: string | null;
  market_kind: Market["market_kind"] | null;
  outcome_options: Market["outcome_options"] | null;
  bet_outcome: string | null;
  task_title: string | null;
};

// A row saying "結果報告の保証金 −100pt" with nothing else on it is a
// receipt with the shop name torn off. Every entry points at either a
// market, a bet (which belongs to a market), or a task, so resolve that
// reference here and let the history name what the movement was about.
export async function getUserTreasuryLogs(userId: string): Promise<TreasuryLogWithContext[]> {
  const result = await query<TreasuryLogWithContext>(
    `select l.*,
            coalesce(mk.id, bm.id) as market_id,
            coalesce(mk.title, bm.title) as market_title,
            coalesce(mk.home_team, bm.home_team) as home_team,
            coalesce(mk.away_team, bm.away_team) as away_team,
            coalesce(mk.market_kind, bm.market_kind) as market_kind,
            coalesce(mk.outcome_options, bm.outcome_options) as outcome_options,
            b.outcome as bet_outcome,
            t.title as task_title
     from treasury_logs l
     left join markets mk on l.ref_table = 'markets' and mk.id = l.ref_id
     left join bets b on l.ref_table = 'bets' and b.id = l.ref_id
     left join markets bm on bm.id = b.market_id
     left join tasks t on l.ref_table = 'tasks' and t.id = l.ref_id
     where l.user_id = $1
     order by l.created_at desc
     limit 50`,
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

// Reports that still count toward removal. Reports filed before an admin
// dismissed them are deliberately excluded — they were reviewed and found
// unfounded, so they must not be able to combine with a later one.
export async function getActiveReportCount(market: Market): Promise<number> {
  const result = await query<{ count: string }>(
    `select count(*) as count from market_reports
     where market_id = $1 and ($2::timestamptz is null or created_at > $2)`,
    [market.id, market.reports_dismissed_at]
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function hasReportedMarket(marketId: string, userId: string): Promise<boolean> {
  const result = await query(
    "select 1 from market_reports where market_id = $1 and user_id = $2",
    [marketId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

export type ReportedMarket = Market & { report_count: string; categories: string[] };

// The moderation queue: markets with live reports that haven't reached the
// threshold, so an admin can step in before or instead of the vote.
export async function getReportedMarkets(): Promise<ReportedMarket[]> {
  const result = await query<ReportedMarket>(
    `select m.*,
            count(r.id) as report_count,
            array_agg(distinct r.category) as categories
     from markets m
     join market_reports r on r.market_id = m.id
     where m.banned_at is null
       and (m.reports_dismissed_at is null or r.created_at > m.reports_dismissed_at)
     group by m.id
     order by count(r.id) desc, max(r.created_at) desc`
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

// News-first feed: each article carries the market(s) curated alongside
// it (usually one). markets is aggregated as json so this is a single
// round trip regardless of feed length.
export async function getNewsFeed(): Promise<NewsFeedItem[]> {
  await tickMarketLifecycle();
  const result = await query<NewsFeedItem>(
    `select
       a.*,
       coalesce(
         json_agg(m.* order by m.created_at desc) filter (where m.id is not null),
         '[]'
       ) as markets
     from news_articles a
     left join markets m on m.news_article_id = a.id
     group by a.id
     order by a.published_at desc`
  );
  return result.rows;
}

export async function getCommentsForArticle(newsArticleId: string): Promise<Comment[]> {
  const result = await query<Comment>(
    `select c.*, p.username
     from comments c join profiles p on p.id = c.user_id
     where c.news_article_id = $1
     order by c.created_at asc`,
    [newsArticleId]
  );
  return result.rows;
}
