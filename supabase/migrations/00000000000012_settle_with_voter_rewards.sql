-- =========================================================================
-- Settlement with voter rewards, and the finalizer wired to the new bonds
--
-- The rake now has three claimants instead of two. Order matters: the
-- creator's cut and the voters' cut both come off the rake, and whatever
-- survives is the treasury's. Splitting it this way means a market that
-- nobody had to vote on simply leaves the voters' share with the
-- treasury, rather than needing a separate code path.
-- =========================================================================

-- Drop the previous signatures first. A function with defaulted trailing
-- arguments and an older shorter one are both callable as f(a, b), which
-- Postgres rejects as ambiguous rather than preferring either — so the
-- old versions have to go, not just be shadowed.
drop function if exists public.settle_market(uuid, text);
drop function if exists public.finalize_expired_markets();

create or replace function public.settle_market(
  p_market_id uuid,
  p_outcome text,
  p_voter_rake_bps int default 5000,
  p_vote_flat_reward bigint default 3,
  p_vote_reward_slots int default 10
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
  v_creator_fee bigint;
  v_voter_share bigint;
  v_seed bigint;
  v_distributable_profit bigint;
  v_bet record;
  v_payout bigint;
  v_user_balance bigint;
  v_treasury_balance bigint;
  v_refund bigint;
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

    if p_outcome = 'void' and v_market.created_by is not null then
      select coalesce(sum(-points_delta), 0) into v_refund
        from treasury_logs
        where entry_type = 'market_creation_fee' and ref_table = 'markets' and ref_id = p_market_id;

      if v_refund > 0 then
        update profiles set points_balance = points_balance + v_refund, updated_at = now()
          where id = v_market.created_by
          returning points_balance into v_user_balance;
        update treasury set balance = balance - v_refund, updated_at = now()
          where id = 1
          returning balance into v_treasury_balance;
        insert into treasury_logs (
          entry_type, user_id, points_delta, treasury_delta,
          user_balance_after, treasury_balance_after, ref_table, ref_id, memo
        ) values (
          'market_creation_fee', v_market.created_by, v_refund, -v_refund,
          v_user_balance, v_treasury_balance, 'markets', p_market_id, 'creation fee refunded (market voided)'
        );
      end if;
    end if;

    update markets
      set status = 'resolved',
          outcome = case when p_outcome = 'void' then null else p_outcome end,
          resolved_at = now(),
          seed_pool = 0
      where id = p_market_id
      returning * into v_market;
    return v_market;
  end if;

  v_losing_pool := v_total_pool - v_winning_pool;
  v_rake := (v_losing_pool * v_market.rake_bps) / 10000;
  v_seed := v_market.seed_pool;
  v_distributable_profit := (v_losing_pool - v_rake) + v_seed;

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

  if v_seed > 0 then
    update treasury set balance = balance - v_seed, updated_at = now()
      where id = 1
      returning balance into v_treasury_balance;

    insert into treasury_logs (
      entry_type, user_id, points_delta, treasury_delta,
      treasury_balance_after, ref_table, ref_id, memo
    ) values (
      'market_seed_payout', null, 0, -v_seed,
      v_treasury_balance, 'markets', p_market_id, 'seeded prize pool paid out to winners'
    );
  end if;

  v_creator_fee := 0;
  if v_rake > 0 and v_market.created_by is not null and v_market.creator_fee_bps > 0 then
    v_creator_fee := (v_rake * v_market.creator_fee_bps) / 10000;
  end if;

  v_voter_share := (v_rake * p_voter_rake_bps) / 10000;

  -- Whatever the creator and the voters don't take stays with the house.
  if v_rake - v_creator_fee - v_voter_share > 0 then
    update treasury set balance = balance + (v_rake - v_creator_fee - v_voter_share), updated_at = now()
      where id = 1
      returning balance into v_treasury_balance;

    insert into treasury_logs (
      entry_type, user_id, points_delta, treasury_delta,
      treasury_balance_after, ref_table, ref_id, memo
    ) values (
      'rake_collected', null, 0, v_rake - v_creator_fee - v_voter_share,
      v_treasury_balance, 'markets', p_market_id, 'terasen collected from the losing pool on settlement'
    );
  end if;

  if v_creator_fee > 0 then
    update profiles set points_balance = points_balance + v_creator_fee, updated_at = now()
      where id = v_market.created_by
      returning points_balance into v_user_balance;

    insert into treasury_logs (
      entry_type, user_id, points_delta, treasury_delta,
      user_balance_after, treasury_balance_after, ref_table, ref_id, memo
    ) values (
      'creator_fee', v_market.created_by, v_creator_fee, 0,
      v_user_balance, (select balance from treasury where id = 1), 'markets', p_market_id,
      'market creator share of the terasen'
    );
  end if;

  -- The voters' share plus the flat first-N bonus. If nobody voted, the
  -- share was already counted into the treasury's remainder above, so
  -- this is a no-op.
  perform reward_correct_voters(
    p_market_id, p_outcome, v_voter_share, p_vote_flat_reward, p_vote_reward_slots
  );

  update markets
    set status = 'resolved', outcome = p_outcome, resolved_at = now(), seed_pool = 0
    where id = p_market_id
    returning * into v_market;

  return v_market;
end;
$$;
revoke execute on function public.settle_market(uuid, text, int, bigint, int) from anon, authenticated;
grant execute on function public.settle_market(uuid, text, int, bigint, int) to service_role;

-- ---------------------------------------------------------------------
-- finalize_expired_markets: unchanged sweeps, now settling both sides'
-- bonds through settle_bonds instead of only releasing the proposer's.
-- ---------------------------------------------------------------------
create or replace function public.finalize_expired_markets(
  p_bond_award_bps int default 7000
) returns void
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
    -- Uncontested: the proposer was right by default.
    perform settle_bonds(m.id, null, true, p_bond_award_bps);
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

    perform settle_bonds(c.market_id, c.id, v_final_outcome = c.provisional_outcome, p_bond_award_bps);
    perform settle_market(c.market_id, v_final_outcome);
  end loop;
end;
$$;
