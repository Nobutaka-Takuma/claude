-- =========================================================================
-- Generalize markets beyond 3-way soccer results (home/draw/away) to
-- arbitrary questions — e.g. "will player X start in the season opener?"
-- (a yes/no market) or any multi-choice question.
--
-- The fixed `market_outcome` enum is replaced by a per-market
-- `outcome_options` jsonb array of {key, label} pairs, and every outcome
-- column (markets.outcome, bets.outcome, votes.voted_outcome) becomes
-- plain text holding one of those keys. 'void' stays a reserved sentinel
-- for "market cancelled, refund everyone" and can never be a real option
-- key (enforced in propose_market / upsert_auto_market).
--
-- market_kind distinguishes:
--   'match_winner' — the original 3-way soccer result; home_team/away_team
--                     stay populated and outcome_options is auto-derived
--                     from them ([home, draw, away]).
--   'binary'        — a yes/no question; home_team/away_team are null.
--   'multi_outcome'  — an arbitrary list of named options; home_team/
--                     away_team are null.
-- =========================================================================

drop view if exists market_pools;

-- --- bets.outcome: enum -> text ------------------------------------------
alter table bets drop constraint if exists bets_outcome_check;
alter table bets alter column outcome type text using outcome::text;

-- --- markets.outcome: enum -> text ----------------------------------------
alter table markets alter column outcome type text using outcome::text;

-- --- votes.voted_outcome: enum -> text ------------------------------------
alter table votes alter column voted_outcome type text using voted_outcome::text;

-- --- markets: market_kind + outcome_options -------------------------------
alter table markets add column market_kind text not null default 'match_winner'
  check (market_kind in ('match_winner', 'binary', 'multi_outcome'));
alter table markets add column outcome_options jsonb not null default '[]'::jsonb;

-- Backfill outcome_options for existing match_winner rows from their
-- home_team/away_team so nothing already in the table breaks.
update markets
  set outcome_options = jsonb_build_array(
    jsonb_build_object('key', 'home', 'label', home_team),
    jsonb_build_object('key', 'draw', 'label', '引き分け'),
    jsonb_build_object('key', 'away', 'label', away_team)
  )
  where market_kind = 'match_winner' and home_team is not null and away_team is not null;

alter table markets alter column home_team drop not null;
alter table markets alter column away_team drop not null;

create view market_pools as
  select
    market_id,
    outcome,
    coalesce(sum(amount), 0) as pool_amount,
    count(*) as bettor_count
  from bets
  where status = 'active'
  group by market_id, outcome;

-- =========================================================================
-- Function signatures that took a `market_outcome` argument must be
-- dropped before the enum can go away (CREATE OR REPLACE with a new
-- signature would just add an overload, not replace it).
-- =========================================================================
drop function if exists public.place_bet(uuid, uuid, market_outcome, bigint);
drop function if exists public.settle_market(uuid, market_outcome);
drop function if exists public.submit_provisional_result(uuid, market_outcome, int);
drop function if exists public.propose_market(uuid, text, text, text, timestamptz, text, text);

-- ---------------------------------------------------------------------
-- upsert_auto_market: called by the sports-API fixture sync batch.
-- Idempotent on external_ref — re-running the sync updates kickoff time
-- (postponements) without touching a market that has already moved past
-- 'open' (locked/settled/disputed markets are never silently rewritten).
-- ---------------------------------------------------------------------
create or replace function public.upsert_auto_market(
  p_external_ref text,
  p_title text,
  p_home_team text,
  p_away_team text,
  p_kickoff_time timestamptz,
  p_category text default 'soccer'
) returns public.markets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market markets%rowtype;
  v_options jsonb;
begin
  v_options := jsonb_build_array(
    jsonb_build_object('key', 'home', 'label', p_home_team),
    jsonb_build_object('key', 'draw', 'label', '引き分け'),
    jsonb_build_object('key', 'away', 'label', p_away_team)
  );

  insert into markets (
    title, category, source, external_ref, home_team, away_team, kickoff_time,
    status, market_kind, outcome_options
  ) values (
    p_title, p_category, 'api_auto', p_external_ref, p_home_team, p_away_team, p_kickoff_time,
    'open', 'match_winner', v_options
  )
  on conflict (external_ref) where external_ref is not null
  do update set
    title = excluded.title,
    home_team = excluded.home_team,
    away_team = excluded.away_team,
    kickoff_time = excluded.kickoff_time,
    outcome_options = excluded.outcome_options
  where markets.status = 'open'
  returning * into v_market;

  if not found then
    select * into v_market from markets where external_ref = p_external_ref;
  end if;

  return v_market;
end;
$$;
revoke execute on function public.upsert_auto_market(text, text, text, text, timestamptz, text) from anon, authenticated;
grant execute on function public.upsert_auto_market(text, text, text, text, timestamptz, text) to service_role;

-- ---------------------------------------------------------------------
-- place_bet: p_outcome must now be one of the market's outcome_options
-- keys, validated against that market's own JSON instead of a fixed enum.
-- ---------------------------------------------------------------------
create or replace function public.place_bet(
  p_user_id uuid,
  p_market_id uuid,
  p_outcome text,
  p_amount bigint
) returns public.bets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market markets%rowtype;
  v_user_balance bigint;
  v_bet bets%rowtype;
begin
  if p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  select * into v_market from markets where id = p_market_id for update;
  if not found then
    raise exception 'market_not_found';
  end if;
  if v_market.status = 'open' and v_market.kickoff_time <= now() then
    update markets set status = 'locked' where id = p_market_id;
    v_market.status := 'locked';
  end if;
  if v_market.status <> 'open' then
    raise exception 'market_not_open';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_market.outcome_options) o where o->>'key' = p_outcome) then
    raise exception 'invalid_outcome';
  end if;

  select points_balance into v_user_balance from profiles where id = p_user_id for update;
  if not found then
    raise exception 'user_not_found';
  end if;
  if v_user_balance < p_amount then
    raise exception 'insufficient_balance';
  end if;

  update profiles
    set points_balance = points_balance - p_amount, updated_at = now()
    where id = p_user_id
    returning points_balance into v_user_balance;

  insert into bets (market_id, user_id, outcome, amount, status)
    values (p_market_id, p_user_id, p_outcome, p_amount, 'active')
    returning * into v_bet;

  insert into treasury_logs (
    entry_type, user_id, points_delta, treasury_delta,
    user_balance_after, treasury_balance_after, ref_table, ref_id, memo
  ) values (
    'bet_placed', p_user_id, -p_amount, 0,
    v_user_balance, (select balance from treasury where id = 1), 'bets', v_bet.id, 'bet placed'
  );

  return v_bet;
end;
$$;
revoke execute on function public.place_bet(uuid, uuid, text, bigint) from anon, authenticated;
grant execute on function public.place_bet(uuid, uuid, text, bigint) to service_role;

-- ---------------------------------------------------------------------
-- settle_market: p_outcome is 'void' or one of outcome_options' keys.
-- Payout math (stake-back guarantee) is unchanged from before, just
-- operating on text keys instead of the old enum.
-- ---------------------------------------------------------------------
create or replace function public.settle_market(
  p_market_id uuid,
  p_outcome text
) returns public.markets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market markets%rowtype;
  v_total_pool bigint;
  v_winning_pool bigint;
  v_losing_pool bigint;
  v_rake bigint;
  v_distributable_profit bigint;
  v_bet record;
  v_payout bigint;
  v_user_balance bigint;
  v_treasury_balance bigint;
begin
  select * into v_market from markets where id = p_market_id for update;
  if not found then
    raise exception 'market_not_found';
  end if;
  if v_market.status not in ('open', 'locked', 'pending_resolution', 'disputed') then
    raise exception 'market_not_settleable';
  end if;
  if p_outcome <> 'void' and not exists (
    select 1 from jsonb_array_elements(v_market.outcome_options) o where o->>'key' = p_outcome
  ) then
    raise exception 'invalid_outcome';
  end if;

  select coalesce(sum(amount), 0) into v_total_pool from bets where market_id = p_market_id and status = 'active';

  if p_outcome = 'void' then
    v_winning_pool := 0;
  else
    select coalesce(sum(amount), 0) into v_winning_pool
      from bets where market_id = p_market_id and status = 'active' and outcome = p_outcome;
  end if;

  if p_outcome = 'void' or v_winning_pool = 0 then
    for v_bet in select * from bets where market_id = p_market_id and status = 'active' for update loop
      update profiles set points_balance = points_balance + v_bet.amount, updated_at = now()
        where id = v_bet.user_id
        returning points_balance into v_user_balance;
      update bets set status = 'refunded', payout_amount = v_bet.amount, settled_at = now() where id = v_bet.id;
      insert into treasury_logs (
        entry_type, user_id, points_delta, treasury_delta,
        user_balance_after, treasury_balance_after, ref_table, ref_id, memo
      ) values (
        'bet_refund', v_bet.user_id, v_bet.amount, 0,
        v_user_balance, (select balance from treasury where id = 1), 'bets', v_bet.id, 'market voided, stake refunded'
      );
    end loop;

    update markets
      set status = 'resolved',
          outcome = case when p_outcome = 'void' then null else p_outcome end,
          resolved_at = now()
      where id = p_market_id
      returning * into v_market;
    return v_market;
  end if;

  v_losing_pool := v_total_pool - v_winning_pool;
  v_rake := (v_losing_pool * v_market.rake_bps) / 10000;
  v_distributable_profit := v_losing_pool - v_rake;

  for v_bet in select * from bets where market_id = p_market_id and status = 'active' for update loop
    if v_bet.outcome = p_outcome then
      v_payout := v_bet.amount + (v_bet.amount * v_distributable_profit) / v_winning_pool;
      update profiles set points_balance = points_balance + v_payout, updated_at = now()
        where id = v_bet.user_id
        returning points_balance into v_user_balance;
      update bets set status = 'won', payout_amount = v_payout, settled_at = now() where id = v_bet.id;
      insert into treasury_logs (
        entry_type, user_id, points_delta, treasury_delta,
        user_balance_after, treasury_balance_after, ref_table, ref_id, memo
      ) values (
        'bet_payout', v_bet.user_id, v_payout, 0,
        v_user_balance, (select balance from treasury where id = 1), 'bets', v_bet.id, 'winning payout (stake + profit share)'
      );
    else
      update bets set status = 'lost', payout_amount = 0, settled_at = now() where id = v_bet.id;
    end if;
  end loop;

  if v_rake > 0 then
    update treasury set balance = balance + v_rake, updated_at = now()
      where id = 1
      returning balance into v_treasury_balance;

    insert into treasury_logs (
      entry_type, user_id, points_delta, treasury_delta,
      treasury_balance_after, ref_table, ref_id, memo
    ) values (
      'rake_collected', null, 0, v_rake,
      v_treasury_balance, 'markets', p_market_id, 'terasen collected from the losing pool on settlement'
    );
  end if;

  update markets
    set status = 'resolved', outcome = p_outcome, resolved_at = now()
    where id = p_market_id
    returning * into v_market;

  return v_market;
end;
$$;
revoke execute on function public.settle_market(uuid, text) from anon, authenticated;
grant execute on function public.settle_market(uuid, text) to service_role;

-- ---------------------------------------------------------------------
-- submit_provisional_result: outcome must be a real outcome_options key
-- (never 'void' — cancelling isn't a "result", it stays on settle_market).
-- ---------------------------------------------------------------------
create or replace function public.submit_provisional_result(
  p_market_id uuid,
  p_outcome text,
  p_dispute_window_minutes int default 1440
) returns public.markets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market markets%rowtype;
begin
  if p_dispute_window_minutes <= 0 then
    raise exception 'invalid_dispute_window';
  end if;

  select * into v_market from markets where id = p_market_id for update;
  if not found then
    raise exception 'market_not_found';
  end if;
  if v_market.status <> 'locked' then
    raise exception 'market_not_awaiting_result';
  end if;
  if p_outcome = 'void' or not exists (
    select 1 from jsonb_array_elements(v_market.outcome_options) o where o->>'key' = p_outcome
  ) then
    raise exception 'invalid_outcome';
  end if;

  update markets
    set outcome = p_outcome,
        status = 'pending_resolution',
        resolution_source = coalesce(v_market.resolution_source, 'admin_provisional'),
        dispute_deadline = now() + (p_dispute_window_minutes || ' minutes')::interval
    where id = p_market_id
    returning * into v_market;

  return v_market;
end;
$$;
revoke execute on function public.submit_provisional_result(uuid, text, int) from anon, authenticated;
grant execute on function public.submit_provisional_result(uuid, text, int) to service_role;

-- ---------------------------------------------------------------------
-- finalize_expired_markets: unchanged logic, just text-typed throughout
-- now instead of the removed enum.
-- ---------------------------------------------------------------------
create or replace function public.finalize_expired_markets() returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
  c record;
  tally record;
  v_final_outcome text;
begin
  for m in
    select markets.* from markets
    where status = 'pending_resolution'
      and dispute_deadline is not null
      and dispute_deadline <= now()
      and not exists (
        select 1 from challenges ch where ch.market_id = markets.id and ch.status = 'open'
      )
  loop
    perform settle_market(m.id, m.outcome);
  end loop;

  for c in
    select ch.*, mk.outcome as provisional_outcome
    from challenges ch
    join markets mk on mk.id = ch.market_id
    where ch.status = 'open' and ch.voting_deadline <= now()
  loop
    select v.voted_outcome, sum(v.voting_power) as power
      into tally
      from votes v
      where v.challenge_id = c.id
      group by v.voted_outcome
      order by power desc, (v.voted_outcome = c.provisional_outcome) desc
      limit 1;

    v_final_outcome := coalesce(tally.voted_outcome, c.provisional_outcome);

    update challenges
      set status = (case when v_final_outcome = c.provisional_outcome then 'rejected' else 'upheld' end)::challenge_status,
          resolved_at = now()
      where id = c.id;

    perform settle_market(c.market_id, v_final_outcome);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- propose_market: two shapes depending on p_market_kind.
--   'match_winner'  -> pass p_home_team/p_away_team, outcome_options is
--                       auto-derived (draw included).
--   'binary' / 'multi_outcome' -> pass p_outcome_options directly, e.g.
--                       '[{"key":"yes","label":"はい"},{"key":"no","label":"いいえ"}]'
-- ---------------------------------------------------------------------
create or replace function public.propose_market(
  p_user_id uuid,
  p_title text,
  p_market_kind text,
  p_kickoff_time timestamptz,
  p_outcome_options jsonb,
  p_description text default null,
  p_category text default 'soccer',
  p_home_team text default null,
  p_away_team text default null
) returns public.markets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market markets%rowtype;
  v_options jsonb;
  v_key_count int;
  v_distinct_key_count int;
begin
  if p_kickoff_time <= now() then
    raise exception 'kickoff_must_be_future';
  end if;
  if p_market_kind not in ('match_winner', 'binary', 'multi_outcome') then
    raise exception 'invalid_market_kind';
  end if;

  if p_market_kind = 'match_winner' then
    if p_home_team is null or p_away_team is null
       or length(trim(p_home_team)) = 0 or length(trim(p_away_team)) = 0 then
      raise exception 'home_away_required';
    end if;
    v_options := jsonb_build_array(
      jsonb_build_object('key', 'home', 'label', p_home_team),
      jsonb_build_object('key', 'draw', 'label', '引き分け'),
      jsonb_build_object('key', 'away', 'label', p_away_team)
    );
  else
    if p_outcome_options is null or jsonb_typeof(p_outcome_options) <> 'array'
       or jsonb_array_length(p_outcome_options) < 2 or jsonb_array_length(p_outcome_options) > 8 then
      raise exception 'invalid_outcome_options';
    end if;
    v_options := p_outcome_options;
  end if;

  select count(*), count(distinct o->>'key')
    into v_key_count, v_distinct_key_count
    from jsonb_array_elements(v_options) o;
  if v_key_count <> v_distinct_key_count then
    raise exception 'duplicate_outcome_keys';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_options) o
    where o->>'key' is null or length(trim(o->>'key')) = 0
       or o->>'label' is null or length(trim(o->>'label')) = 0
  ) then
    raise exception 'invalid_outcome_key';
  end if;
  if exists (select 1 from jsonb_array_elements(v_options) o where o->>'key' = 'void') then
    raise exception 'reserved_outcome_key';
  end if;

  insert into markets (
    title, description, category, source, home_team, away_team, kickoff_time,
    status, created_by, market_kind, outcome_options
  ) values (
    p_title, p_description, p_category, 'user_proposed',
    case when p_market_kind = 'match_winner' then p_home_team else null end,
    case when p_market_kind = 'match_winner' then p_away_team else null end,
    p_kickoff_time, 'proposed', p_user_id, p_market_kind, v_options
  )
  returning * into v_market;

  return v_market;
end;
$$;
revoke execute on function public.propose_market(uuid, text, text, timestamptz, jsonb, text, text, text, text) from anon, authenticated;
grant execute on function public.propose_market(uuid, text, text, timestamptz, jsonb, text, text, text, text) to service_role;

drop type if exists market_outcome;
