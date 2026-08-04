-- =========================================================================
-- place_bet / settle_market / propose_market / vote_market_proposal /
-- sync_market_status
--
-- These complete the fund-circulation loop that 0002's complete_task starts:
-- points earned from labor flow into bets, bets fund payouts to winners,
-- and the rake tops the treasury back up. Same pattern as complete_task —
-- SECURITY DEFINER, service_role-only, everything in one transaction per
-- call, row locks taken in a fixed order (market -> profile -> bets) so
-- concurrent calls can't interleave into a lost update.
-- =========================================================================

-- ---------------------------------------------------------------------
-- sync_market_status: lazily flips markets whose kickoff has passed from
-- 'open' to 'locked'. Called at the top of read/write paths that touch
-- markets instead of running a cron job.
-- ---------------------------------------------------------------------
create or replace function public.sync_market_status() returns void
language sql
security definer
set search_path = public
as $$
  update markets
    set status = 'locked'
    where status = 'open' and kickoff_time <= now();
$$;
revoke execute on function public.sync_market_status() from anon, authenticated;
grant execute on function public.sync_market_status() to service_role;

-- ---------------------------------------------------------------------
-- place_bet
-- ---------------------------------------------------------------------
create or replace function public.place_bet(
  p_user_id uuid,
  p_market_id uuid,
  p_outcome market_outcome,
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
  if p_outcome not in ('home', 'away', 'draw') then
    raise exception 'invalid_outcome';
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
revoke execute on function public.place_bet(uuid, uuid, market_outcome, bigint) from anon, authenticated;
grant execute on function public.place_bet(uuid, uuid, market_outcome, bigint) to service_role;

-- ---------------------------------------------------------------------
-- settle_market: resolves a market and pays out its parimutuel pool.
-- If nobody backed the winning outcome, every active bet is refunded
-- instead (no rake charged on a pool with no winners to pay).
-- ---------------------------------------------------------------------
create or replace function public.settle_market(
  p_market_id uuid,
  p_outcome market_outcome
) returns public.markets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market markets%rowtype;
  v_total_pool bigint;
  v_winning_pool bigint;
  v_rake bigint;
  v_distributable bigint;
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

  select coalesce(sum(amount), 0) into v_total_pool from bets where market_id = p_market_id and status = 'active';

  if p_outcome = 'void' then
    v_winning_pool := 0;
  else
    select coalesce(sum(amount), 0) into v_winning_pool
      from bets where market_id = p_market_id and status = 'active' and outcome = p_outcome;
  end if;

  if p_outcome = 'void' or v_winning_pool = 0 then
    -- No winners to pay (or an explicit void): refund every active stake, no rake.
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
      set status = 'resolved', outcome = null, resolved_at = now()
      where id = p_market_id
      returning * into v_market;
    return v_market;
  end if;

  v_rake := (v_total_pool * v_market.rake_bps) / 10000;
  v_distributable := v_total_pool - v_rake;

  for v_bet in select * from bets where market_id = p_market_id and status = 'active' for update loop
    if v_bet.outcome = p_outcome then
      v_payout := (v_bet.amount * v_distributable) / v_winning_pool;
      update profiles set points_balance = points_balance + v_payout, updated_at = now()
        where id = v_bet.user_id
        returning points_balance into v_user_balance;
      update bets set status = 'won', payout_amount = v_payout, settled_at = now() where id = v_bet.id;
      insert into treasury_logs (
        entry_type, user_id, points_delta, treasury_delta,
        user_balance_after, treasury_balance_after, ref_table, ref_id, memo
      ) values (
        'bet_payout', v_bet.user_id, v_payout, 0,
        v_user_balance, (select balance from treasury where id = 1), 'bets', v_bet.id, 'winning payout'
      );
    else
      update bets set status = 'lost', payout_amount = 0, settled_at = now() where id = v_bet.id;
    end if;
  end loop;

  update treasury set balance = balance + v_rake, updated_at = now()
    where id = 1
    returning balance into v_treasury_balance;

  insert into treasury_logs (
    entry_type, user_id, points_delta, treasury_delta,
    treasury_balance_after, ref_table, ref_id, memo
  ) values (
    'rake_collected', null, 0, v_rake,
    v_treasury_balance, 'markets', p_market_id, 'terasen collected on settlement'
  );

  update markets
    set status = 'resolved', outcome = p_outcome, resolved_at = now()
    where id = p_market_id
    returning * into v_market;

  return v_market;
end;
$$;
revoke execute on function public.settle_market(uuid, market_outcome) from anon, authenticated;
grant execute on function public.settle_market(uuid, market_outcome) to service_role;

-- ---------------------------------------------------------------------
-- propose_market / vote_market_proposal
-- ---------------------------------------------------------------------
create or replace function public.propose_market(
  p_user_id uuid,
  p_title text,
  p_home_team text,
  p_away_team text,
  p_kickoff_time timestamptz,
  p_description text default null,
  p_category text default 'soccer'
) returns public.markets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market markets%rowtype;
begin
  if p_kickoff_time <= now() then
    raise exception 'kickoff_must_be_future';
  end if;

  insert into markets (title, description, category, source, home_team, away_team, kickoff_time, status, created_by)
    values (p_title, p_description, p_category, 'user_proposed', p_home_team, p_away_team, p_kickoff_time, 'proposed', p_user_id)
    returning * into v_market;

  return v_market;
end;
$$;
revoke execute on function public.propose_market(uuid, text, text, text, timestamptz, text, text) from anon, authenticated;
grant execute on function public.propose_market(uuid, text, text, text, timestamptz, text, text) to service_role;

create or replace function public.vote_market_proposal(
  p_user_id uuid,
  p_market_id uuid,
  p_approval_threshold int default 3
) returns public.markets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market markets%rowtype;
  v_vote_count int;
begin
  select * into v_market from markets where id = p_market_id for update;
  if not found then
    raise exception 'market_not_found';
  end if;
  if v_market.status <> 'proposed' then
    raise exception 'market_not_open_for_voting';
  end if;

  insert into market_proposal_votes (market_id, user_id) values (p_market_id, p_user_id);

  select count(*) into v_vote_count from market_proposal_votes where market_id = p_market_id;

  if v_vote_count >= p_approval_threshold then
    update markets set status = 'open', approved_at = now() where id = p_market_id
      returning * into v_market;
  end if;

  return v_market;
end;
$$;
revoke execute on function public.vote_market_proposal(uuid, uuid, int) from anon, authenticated;
grant execute on function public.vote_market_proposal(uuid, uuid, int) to service_role;
