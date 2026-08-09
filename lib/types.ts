export type TaskType = "ad_view" | "survey" | "micro_work";

// How a submission turns into points. Anything a human actually produced
// needs one of the two review modes — paying out on trust turns the task
// into a points printer within a day of going live.
export type VerificationMode = "auto" | "review" | "quorum" | "none";

export type TaskCompletionStatus = "pending" | "verified" | "rejected";

export type SponsorKind = "advertiser" | "agency" | "client" | "internal";
export type CampaignStatus = "draft" | "active" | "paused" | "finished";

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
  // --- 0017: sponsors, campaigns, micro-work ---
  campaign_id: string | null;
  work_kind: string | null;
  verification_mode: VerificationMode;
  quorum_size: number;
  review_reward_points: string;
  cooldown_minutes: number | null;
  max_completions_total: number | null;
  revenue_per_completion_yen: string | null;
}

// One field of a micro-work submission form, described in tasks.config so
// a new kind of work needs a row, not a deploy.
export interface WorkFormField {
  id: string;
  label: string;
  type: "text" | "textarea" | "url" | "number" | "select" | "checkbox";
  options?: string[];
  required?: boolean;
  help?: string;
  placeholder?: string;
}

export interface TaskCompletion {
  id: string;
  task_id: string;
  user_id: string;
  status: TaskCompletionStatus;
  reward_points: string;
  idempotency_key: string;
  verification: Record<string, unknown>;
  submission: Record<string, unknown>;
  campaign_id: string | null;
  revenue_yen: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  reward_log_id: string | null;
  completed_at: string;
  verified_at: string | null;
}

export interface Sponsor {
  id: string;
  name: string;
  kind: SponsorKind;
  contact: string | null;
  note: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Campaign {
  id: string;
  sponsor_id: string;
  code: string;
  title: string;
  status: CampaignStatus;
  revenue_per_completion_yen: string;
  fixed_fee_yen: string;
  budget_yen: string | null;
  max_completions: number | null;
  point_value_yen: string;
  starts_at: string | null;
  ends_at: string | null;
  note: string | null;
  created_at: string;
}

// The campaign_economics view: the one place yen received and the cost of
// the points handed out are put side by side.
export interface CampaignEconomics {
  id: string;
  code: string;
  title: string;
  status: CampaignStatus;
  sponsor_name: string;
  sponsor_kind: SponsorKind;
  budget_yen: string | null;
  max_completions: number | null;
  point_value_yen: string;
  verified_completions: string;
  pending_completions: string;
  accrued_yen: string;
  paid_yen: string;
  granted_points: string;
  review_points: string;
  point_cost_yen: string;
  margin_yen: string;
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
  // Prize money the creator seeded, paid to winners on settlement.
  seed_pool: string;
  // When the result is expected to be known. kickoff_time is the betting
  // deadline; this is the separate "when will we find out" date.
  resolves_at: string | null;
  league: string | null;
  matchweek: number | null;
  // Link backing the reported result, so the dispute window is usable by
  // someone who wasn't watching.
  resolution_evidence_url: string | null;
  // Set when the community removed this market for violating the
  // guidelines, as opposed to an ordinary cancellation.
  banned_at: string | null;
  ban_reason: string | null;
  reports_dismissed_at: string | null;
}

export interface MarketReport {
  id: string;
  market_id: string;
  user_id: string;
  category: string;
  note: string | null;
  created_at: string;
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
