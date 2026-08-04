export type TaskType = "ad_view" | "survey";

export type MarketStatus =
  | "proposed"
  | "open"
  | "locked"
  | "pending_resolution"
  | "disputed"
  | "resolved"
  | "cancelled";

export type BetStatus = "active" | "won" | "lost" | "void" | "refunded";
export type ChallengeStatus = "open" | "upheld" | "rejected" | "withdrawn";
export type UserRole = "user" | "moderator" | "admin";
export type MarketKind = "match_winner" | "binary" | "multi_outcome";

// An outcome is just one of a market's own outcome_options keys (plus the
// reserved 'void' sentinel for cancel/refund) — there is no fixed enum of
// outcomes any more since a market can be a 3-way soccer result, a yes/no
// question, or any other named set of choices.
export interface OutcomeOption {
  key: string;
  label: string;
}

export interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  points_balance: string; // bigint comes back from pg as string
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Treasury {
  id: number;
  balance: string;
  updated_at: string;
}

export interface Task {
  id: string;
  type: TaskType;
  title: string;
  description: string | null;
  reward_points: string;
  provider: string;
  config: Record<string, unknown>;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  max_completions_per_user: number | null;
  created_at: string;
}

export interface Market {
  id: string;
  title: string;
  description: string | null;
  category: string;
  source: "api_auto" | "user_proposed" | "news_curated";
  external_ref: string | null;
  home_team: string | null;
  away_team: string | null;
  kickoff_time: string;
  status: MarketStatus;
  rake_bps: number;
  outcome: string | null;
  resolution_source: string | null;
  dispute_deadline: string | null;
  created_by: string | null;
  approved_at: string | null;
  resolved_at: string | null;
  created_at: string;
  market_kind: MarketKind;
  outcome_options: OutcomeOption[];
  news_article_id: string | null;
  creator_fee_bps: number;
  resolution_proposed_by: string | null;
  resolution_bond: string;
}

export interface NewsArticle {
  id: string;
  title: string;
  body: string;
  source: string;
  category: string;
  published_at: string;
  created_at: string;
  url: string | null;
  external_ref: string | null;
}

export interface NewsFeedItem extends NewsArticle {
  markets: Market[];
}

export interface Comment {
  id: string;
  news_article_id: string;
  user_id: string;
  body: string;
  created_at: string;
  username: string;
}

export interface MarketPool {
  market_id: string;
  outcome: string;
  pool_amount: string;
  bettor_count: string;
}

export interface Bet {
  id: string;
  market_id: string;
  user_id: string;
  outcome: string;
  amount: string;
  status: BetStatus;
  payout_amount: string;
  placed_at: string;
  settled_at: string | null;
}

export interface Challenge {
  id: string;
  market_id: string;
  raised_by: string;
  reason: string;
  evidence_url: string | null;
  status: ChallengeStatus;
  voting_deadline: string;
  resolved_at: string | null;
  created_at: string;
}

export interface Vote {
  id: string;
  challenge_id: string;
  user_id: string;
  voted_outcome: string;
  voting_power: string;
  created_at: string;
}

export interface TreasuryLog {
  id: string;
  entry_type: string;
  user_id: string | null;
  points_delta: string;
  treasury_delta: string;
  user_balance_after: string | null;
  treasury_balance_after: string | null;
  ref_table: string | null;
  ref_id: string | null;
  memo: string | null;
  created_at: string;
}
