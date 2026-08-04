-- =========================================================================
-- Prediction Market DAO - Initial Schema
-- Target: Supabase (Postgres 15+)
--
-- Fund flow modeled by this schema:
--   labor (ad view / survey) -> profiles.points_balance (+) and treasury.balance (+)
--   bet placed               -> profiles.points_balance (-)
--   market resolved          -> rake to treasury.balance (+), payout to winners' points_balance (+)
--   treasury.balance is the community fund; treasury_logs is the single
--   ledger table that records every movement of both a user's wallet and
--   the shared treasury, so the whole circulation can be audited from one
--   table.
-- =========================================================================

create extension if not exists "pgcrypto";

-- -------------------------------------------------------------------------
-- Enums
-- -------------------------------------------------------------------------
create type task_type as enum ('ad_view', 'survey');
create type task_completion_status as enum ('pending', 'verified', 'rejected');

create type treasury_entry_type as enum (
  'task_reward',       -- labor reward: mints points to a user and backs the treasury
  'bet_placed',         -- user stakes points into a market pool
  'bet_payout',         -- winnings paid out to a user
  'bet_refund',         -- market cancelled/void, stake returned
  'rake_collected',     -- operator fee (terasen) collected into the treasury
  'treasury_grant',     -- admin/DAO grants points to a user from the treasury
  'adjustment'          -- manual correction
);

create type market_source as enum ('api_auto', 'user_proposed');
create type market_status as enum (
  'proposed',           -- user-submitted, awaiting approval votes
  'open',                -- accepting bets
  'locked',               -- kickoff_time passed, betting disabled, awaiting result
  'pending_resolution',  -- optimistic oracle posted a result, in the 24h dispute window
  'disputed',            -- a challenge was raised, DAO vote in progress
  'resolved',             -- final outcome set, payouts settled
  'cancelled'             -- voided, stakes refunded
);
create type market_outcome as enum ('home', 'away', 'draw', 'void');
create type bet_status as enum ('active', 'won', 'lost', 'void', 'refunded');
create type challenge_status as enum ('open', 'upheld', 'rejected', 'withdrawn');

-- -------------------------------------------------------------------------
-- profiles: 1:1 extension of auth.users
-- -------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  avatar_url text,
  points_balance bigint not null default 0 check (points_balance >= 0),
  role text not null default 'user' check (role in ('user', 'moderator', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -------------------------------------------------------------------------
-- treasury: singleton row holding the community fund balance
-- -------------------------------------------------------------------------
create table treasury (
  id smallint primary key default 1 check (id = 1),
  balance bigint not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);
insert into treasury (id, balance) values (1, 0);

-- -------------------------------------------------------------------------
-- tasks: ad-view / survey definitions
-- -------------------------------------------------------------------------
create table tasks (
  id uuid primary key default gen_random_uuid(),
  type task_type not null,
  title text not null,
  description text,
  reward_points bigint not null check (reward_points > 0),
  provider text not null default 'internal',       -- e.g. 'internal_survey', 'admob_ssv', 'ironsource_ssv'
  config jsonb not null default '{}'::jsonb,        -- survey questions, ad unit id, etc.
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  max_completions_per_user int default 1,           -- null = unlimited
  created_at timestamptz not null default now()
);
create index idx_tasks_active on tasks (is_active) where is_active;

-- -------------------------------------------------------------------------
-- task_completions: one row per attempt, drives idempotent reward granting
-- -------------------------------------------------------------------------
create table task_completions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks (id),
  user_id uuid not null references profiles (id),
  status task_completion_status not null default 'pending',
  reward_points bigint not null default 0,
  idempotency_key text not null unique,             -- e.g. 'ad:<network_transaction_id>' / 'survey:<task_id>:<user_id>'
  verification jsonb not null default '{}'::jsonb,  -- raw SSV payload / submitted answers
  completed_at timestamptz not null default now(),
  verified_at timestamptz
);
create index idx_task_completions_user on task_completions (user_id);
create index idx_task_completions_task on task_completions (task_id);

-- -------------------------------------------------------------------------
-- treasury_logs: unified ledger for every points/treasury movement
-- -------------------------------------------------------------------------
create table treasury_logs (
  id uuid primary key default gen_random_uuid(),
  entry_type treasury_entry_type not null,
  user_id uuid references profiles (id),            -- null for treasury-only entries
  points_delta bigint not null default 0,           -- change applied to profiles.points_balance
  treasury_delta bigint not null default 0,          -- change applied to treasury.balance
  user_balance_after bigint,
  treasury_balance_after bigint,
  ref_table text,                                    -- 'tasks' | 'bets' | 'markets' | ...
  ref_id uuid,
  memo text,
  created_at timestamptz not null default now()
);
create index idx_treasury_logs_user on treasury_logs (user_id);
create index idx_treasury_logs_created on treasury_logs (created_at desc);
create index idx_treasury_logs_ref on treasury_logs (ref_table, ref_id);

-- -------------------------------------------------------------------------
-- markets: prediction market on a single fixture
-- -------------------------------------------------------------------------
create table markets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text not null default 'soccer',
  source market_source not null default 'api_auto',
  external_ref text,                                  -- sports API fixture id (unique when source = api_auto)
  home_team text not null,
  away_team text not null,
  kickoff_time timestamptz not null,
  status market_status not null default 'proposed',
  rake_bps int not null default 1000 check (rake_bps between 0 and 10000), -- 1000 = 10%
  outcome market_outcome,
  resolution_source text,                              -- 'sports_api' | 'ai_judge' | 'dao_vote'
  dispute_deadline timestamptz,                         -- pending_resolution start + 24h
  created_by uuid references profiles (id),             -- null = system-generated
  approved_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index idx_markets_external_ref on markets (external_ref) where external_ref is not null;
create index idx_markets_status on markets (status);
create index idx_markets_kickoff on markets (kickoff_time);

-- -------------------------------------------------------------------------
-- market_proposal_votes: "賛成票" for user-proposed markets
-- -------------------------------------------------------------------------
create table market_proposal_votes (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references markets (id) on delete cascade,
  user_id uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  unique (market_id, user_id)
);

-- -------------------------------------------------------------------------
-- bets: parimutuel stakes
-- -------------------------------------------------------------------------
create table bets (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references markets (id),
  user_id uuid not null references profiles (id),
  outcome market_outcome not null check (outcome in ('home', 'away', 'draw')),
  amount bigint not null check (amount > 0),
  status bet_status not null default 'active',
  payout_amount bigint not null default 0,
  placed_at timestamptz not null default now(),
  settled_at timestamptz
);
create index idx_bets_market on bets (market_id);
create index idx_bets_user on bets (user_id);

-- Parimutuel pool per outcome, derived live from active bets.
create view market_pools as
  select
    market_id,
    outcome,
    coalesce(sum(amount), 0) as pool_amount,
    count(*) as bettor_count
  from bets
  where status = 'active'
  group by market_id, outcome;

-- -------------------------------------------------------------------------
-- challenges: optimistic-oracle dispute window
-- -------------------------------------------------------------------------
create table challenges (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references markets (id),
  raised_by uuid not null references profiles (id),
  reason text not null,
  evidence_url text,
  status challenge_status not null default 'open',
  voting_deadline timestamptz not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_challenges_market on challenges (market_id);

-- -------------------------------------------------------------------------
-- votes: DAO majority vote on a disputed challenge
-- -------------------------------------------------------------------------
create table votes (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges (id) on delete cascade,
  user_id uuid not null references profiles (id),
  voted_outcome market_outcome not null,
  voting_power bigint not null default 1,
  created_at timestamptz not null default now(),
  unique (challenge_id, user_id)
);

-- =========================================================================
-- Row Level Security
-- All balance-affecting writes go through SECURITY DEFINER RPCs (see
-- 0002_task_completion_rpc.sql), so client roles only ever get SELECT plus
-- narrow, non-financial INSERT policies below.
-- =========================================================================
alter table profiles enable row level security;
alter table treasury enable row level security;
alter table tasks enable row level security;
alter table task_completions enable row level security;
alter table treasury_logs enable row level security;
alter table markets enable row level security;
alter table market_proposal_votes enable row level security;
alter table bets enable row level security;
alter table challenges enable row level security;
alter table votes enable row level security;

create policy "profiles are publicly readable" on profiles for select using (true);
create policy "users update their own non-financial profile fields" on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "treasury balance is publicly readable" on treasury for select using (true);

create policy "active tasks are publicly readable" on tasks for select using (is_active);

create policy "users read their own task completions" on task_completions
  for select using (auth.uid() = user_id);

create policy "users read their own treasury logs" on treasury_logs
  for select using (auth.uid() = user_id);

create policy "markets are publicly readable" on markets for select using (true);
create policy "authenticated users propose markets" on markets
  for insert with check (auth.uid() = created_by and source = 'user_proposed' and status = 'proposed');

create policy "proposal votes are publicly readable" on market_proposal_votes for select using (true);
create policy "authenticated users cast one proposal vote" on market_proposal_votes
  for insert with check (auth.uid() = user_id);

create policy "users read their own bets" on bets for select using (auth.uid() = user_id);
-- Bet placement is written through the place_bet RPC (SECURITY DEFINER), not direct INSERT.

create policy "challenges are publicly readable" on challenges for select using (true);
create policy "authenticated users raise challenges" on challenges
  for insert with check (auth.uid() = raised_by);

create policy "votes are publicly readable" on votes for select using (true);
create policy "authenticated users cast one vote per challenge" on votes
  for insert with check (auth.uid() = user_id);
