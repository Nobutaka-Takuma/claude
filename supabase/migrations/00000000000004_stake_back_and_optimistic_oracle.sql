-- =========================================================================
-- 1) settle_market: stake-back guarantee
--
-- The original payout math took the rake off the *whole* pool, so a
-- winner who wasn't offset by anyone on the losing side (e.g. everyone
-- backed the same outcome) still lost money to the rake despite calling
-- it correctly. Real parimutuel books avoid this by only taking a cut of
-- the money that actually moves from losers to winners: the rake is now
-- computed on the losing pool alone, and every winning bet is paid its
-- stake back in full plus its share of (losing pool - rake). If nobody
-- bet against you, losing_pool = 0, rake = 0, and you simply get your
-- stake back — never less.
--
-- 2) submit_provisional_result / finalize_expired_markets: Optimistic
-- Oracle
--
-- Closes a gap versus the original design: markets were going straight
-- from 'locked' to a paid-out 'resolved' the instant an admin acted, with
-- no dispute window at all. submit_provisional_result posts a result
-- without paying anyone yet (status -> 'pending_resolution', a
-- dispute_deadline is set). finalize_expired_markets is the lazy-cron
-- counterpart to sync_market_status: on each call it settles any
-- pending_resolution market whose window closed uncontested, and tallies
-- + settles any disputed market whose DAO voting_deadline closed.
-- =========================================================================

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

    -- A real outcome with zero backers still happened — keep it on the
    -- record for display purposes. Only an explicit void clears it.
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
      -- Stake back in full, plus a proportional share of the losing pool's profit.
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

-- ---------------------------------------------------------------------
-- submit_provisional_result: posts a result WITHOUT paying anyone out.
-- Starts the dispute clock instead of settling immediately.
-- ---------------------------------------------------------------------
create or replace function public.submit_provisional_result(
  p_market_id uuid,
  p_outcome market_outcome,
  p_dispute_window_minutes int default 1440
) returns public.markets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market markets%rowtype;
begin
  if p_outcome not in ('home', 'away', 'draw') then
    raise exception 'invalid_outcome';
  end if;
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

  update markets
    set outcome = p_outcome,
        status = 'pending_resolution',
        resolution_source = 'admin_provisional',
        dispute_deadline = now() + (p_dispute_window_minutes || ' minutes')::interval
    where id = p_market_id
    returning * into v_market;

  return v_market;
end;
$$;
revoke execute on function public.submit_provisional_result(uuid, market_outcome, int) from anon, authenticated;
grant execute on function public.submit_provisional_result(uuid, market_outcome, int) to service_role;

-- ---------------------------------------------------------------------
-- finalize_expired_markets: the lazy-cron counterpart to
-- sync_market_status. Two independent sweeps:
--   1. pending_resolution markets whose dispute window closed with no
--      open challenge -> settle at the provisional outcome.
--   2. disputed markets whose challenge voting_deadline closed -> tally
--      votes (ties favor the provisional outcome), close the challenge,
--      settle at the tallied outcome.
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
  v_final_outcome market_outcome;
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
revoke execute on function public.finalize_expired_markets() from anon, authenticated;
grant execute on function public.finalize_expired_markets() to service_role;
