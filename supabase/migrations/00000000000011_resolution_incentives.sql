-- =========================================================================
-- Resolution incentives: early resolution, two-sided bonds, voter rewards
--
-- The optimistic oracle from 0009 worked but left three gaps:
--
--   * A result that becomes known BEFORE the betting deadline had nowhere
--     to go — the market kept taking bets on a foregone conclusion until
--     kickoff. request_early_resolution lets anyone pay a bond to freeze
--     betting immediately and put the outcome to a short DAO vote.
--
--   * Only the proposer had money at risk, so filing a challenge was
--     free and griefing cost nothing. Challenges now post the same bond,
--     and the loser's bond mostly goes to the winner rather than the
--     house: being right about a result is what pays.
--
--   * Voting was pure unpaid labour, so a dispute could sit unresolved
--     for want of voters. Correct voters now split half the rake, and
--     the first ten of them get a flat bonus — enough to make showing up
--     worth it while the market is still small.
--
-- Challenges gain a `kind` so the same challenge+votes machinery backs
-- both "I dispute this result" and "let's decide this early", instead of
-- growing a second parallel voting system.
-- =========================================================================

alter type treasury_entry_type add value if not exists 'challenge_bond';
alter type treasury_entry_type add value if not exists 'challenge_bond_forfeited';
alter type treasury_entry_type add value if not exists 'bond_awarded';
alter type treasury_entry_type add value if not exists 'vote_reward';
alter type treasury_entry_type add value if not exists 'voter_rake_share';
alter type treasury_entry_type add value if not exists 'bet_cancelled';

alter table challenges add column kind text not null default 'dispute'
  check (kind in ('dispute', 'early_resolution'));
alter table challenges add column bond bigint not null default 0;

-- ---------------------------------------------------------------------
-- place_bet: a user may now only back ONE outcome per market.
--
-- Betting both sides was never a strategy, just a way to lock in the
-- seed pool at no risk — and it made "which side are you on" meaningless
-- in the UI. Adding to an existing position is still fine.
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
  v_existing_outcome text;
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

  select outcome into v_existing_outcome
    from bets
    where market_id = p_market_id and user_id = p_user_id and status = 'active'
    limit 1;
  if v_existing_outcome is not null and v_existing_outcome <> p_outcome then
    raise exception 'already_bet_other_outcome';
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
-- cancel_bet: withdraw a bet while the market is still open, minus a
-- small penalty so cancelling isn't a free option on every price move.
-- ---------------------------------------------------------------------
create or replace function public.cancel_bet(
  p_user_id uuid,
  p_bet_id uuid,
  p_penalty bigint default 3
) returns public.bets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bet bets%rowtype;
  v_market markets%rowtype;
  v_refund bigint;
  v_penalty bigint;
  v_user_balance bigint;
  v_treasury_balance bigint;
begin
  select * into v_bet from bets where id = p_bet_id for update;
  if not found then
    raise exception 'bet_not_found';
  end if;
  if v_bet.user_id <> p_user_id then
    raise exception 'forbidden';
  end if;
  if v_bet.status <> 'active' then
    raise exception 'bet_not_active';
  end if;

  select * into v_market from markets where id = v_bet.market_id for update;
  if v_market.status = 'open' and v_market.kickoff_time <= now() then
    update markets set status = 'locked' where id = v_market.id;
    v_market.status := 'locked';
  end if;
  if v_market.status <> 'open' then
    raise exception 'market_not_open';
  end if;

  -- Never refund a negative amount: a stake smaller than the penalty
  -- simply forfeits the whole stake instead.
  v_penalty := least(p_penalty, v_bet.amount);
  v_refund := v_bet.amount - v_penalty;

  update bets set status = 'void', payout_amount = v_refund, settled_at = now()
    where id = p_bet_id
    returning * into v_bet;

  update profiles set points_balance = points_balance + v_refund, updated_at = now()
    where id = p_user_id
    returning points_balance into v_user_balance;

  if v_penalty > 0 then
    update treasury set balance = balance + v_penalty, updated_at = now()
      where id = 1
      returning balance into v_treasury_balance;
  else
    select balance into v_treasury_balance from treasury where id = 1;
  end if;

  insert into treasury_logs (
    entry_type, user_id, points_delta, treasury_delta,
    user_balance_after, treasury_balance_after, ref_table, ref_id, memo
  ) values (
    'bet_cancelled', p_user_id, v_refund, v_penalty,
    v_user_balance, v_treasury_balance, 'bets', p_bet_id,
    'bet cancelled (penalty ' || v_penalty || 'pt)'
  );

  return v_bet;
end;
$$;
revoke execute on function public.cancel_bet(uuid, uuid, bigint) from anon, authenticated;
grant execute on function public.cancel_bet(uuid, uuid, bigint) to service_role;

-- ---------------------------------------------------------------------
-- request_early_resolution: the result is already known before the
-- betting deadline. Pay a bond, betting stops immediately, and the
-- proposed outcome goes straight to a short DAO vote (no 24h optimistic
-- window — the whole point is that this is urgent).
-- ---------------------------------------------------------------------
create or replace function public.request_early_resolution(
  p_user_id uuid,
  p_market_id uuid,
  p_outcome text,
  p_bond bigint default 100,
  p_voting_hours int default 3
) returns public.challenges
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market markets%rowtype;
  v_user_balance bigint;
  v_treasury_balance bigint;
  v_challenge challenges%rowtype;
begin
  select * into v_market from markets where id = p_market_id for update;
  if not found then
    raise exception 'market_not_found';
  end if;
  if v_market.status not in ('open', 'locked') then
    raise exception 'market_not_open';
  end if;
  if p_outcome = 'void' or not exists (
    select 1 from jsonb_array_elements(v_market.outcome_options) o where o->>'key' = p_outcome
  ) then
    raise exception 'invalid_outcome';
  end if;

  select points_balance into v_user_balance from profiles where id = p_user_id for update;
  if not found then
    raise exception 'user_not_found';
  end if;
  if v_user_balance < p_bond then
    raise exception 'insufficient_balance';
  end if;

  if p_bond > 0 then
    update profiles set points_balance = points_balance - p_bond, updated_at = now()
      where id = p_user_id
      returning points_balance into v_user_balance;
    update treasury set balance = balance + p_bond, updated_at = now()
      where id = 1
      returning balance into v_treasury_balance;

    insert into treasury_logs (
      entry_type, user_id, points_delta, treasury_delta,
      user_balance_after, treasury_balance_after, ref_table, ref_id, memo
    ) values (
      'resolution_bond', p_user_id, -p_bond, p_bond,
      v_user_balance, v_treasury_balance, 'markets', p_market_id, 'early resolution bond posted'
    );
  end if;

  -- 'disputed' is what stops betting and marks "a DAO vote is running";
  -- kind distinguishes this from a genuine dispute for the UI.
  update markets
    set outcome = p_outcome,
        status = 'disputed',
        resolution_source = 'community_early',
        resolution_proposed_by = p_user_id,
        resolution_bond = p_bond,
        dispute_deadline = now() + (p_voting_hours || ' hours')::interval
    where id = p_market_id;

  insert into challenges (market_id, raised_by, reason, status, voting_deadline, kind, bond)
    values (
      p_market_id, p_user_id, '結果が判明したため早期確定を申請', 'open',
      now() + (p_voting_hours || ' hours')::interval, 'early_resolution', 0
    )
    returning * into v_challenge;

  return v_challenge;
end;
$$;
revoke execute on function public.request_early_resolution(uuid, uuid, text, bigint, int) from anon, authenticated;
grant execute on function public.request_early_resolution(uuid, uuid, text, bigint, int) to service_role;

-- ---------------------------------------------------------------------
-- raise_challenge: disputes now post a bond too, so the risk is
-- symmetric with the proposer's.
-- ---------------------------------------------------------------------
create or replace function public.raise_challenge(
  p_user_id uuid,
  p_market_id uuid,
  p_reason text,
  p_evidence_url text default null,
  p_bond bigint default 100,
  p_voting_hours int default 24
) returns public.challenges
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market markets%rowtype;
  v_user_balance bigint;
  v_treasury_balance bigint;
  v_challenge challenges%rowtype;
begin
  select * into v_market from markets where id = p_market_id for update;
  if not found then
    raise exception 'market_not_found';
  end if;
  if v_market.status <> 'pending_resolution' then
    raise exception 'market_not_disputable';
  end if;
  if exists (select 1 from challenges where market_id = p_market_id and status = 'open') then
    raise exception 'already_challenged';
  end if;

  select points_balance into v_user_balance from profiles where id = p_user_id for update;
  if not found then
    raise exception 'user_not_found';
  end if;
  if v_user_balance < p_bond then
    raise exception 'insufficient_balance';
  end if;

  if p_bond > 0 then
    update profiles set points_balance = points_balance - p_bond, updated_at = now()
      where id = p_user_id
      returning points_balance into v_user_balance;
    update treasury set balance = balance + p_bond, updated_at = now()
      where id = 1
      returning balance into v_treasury_balance;

    insert into treasury_logs (
      entry_type, user_id, points_delta, treasury_delta,
      user_balance_after, treasury_balance_after, ref_table, ref_id, memo
    ) values (
      'challenge_bond', p_user_id, -p_bond, p_bond,
      v_user_balance, v_treasury_balance, 'markets', p_market_id, 'challenge bond posted'
    );
  end if;

  insert into challenges (market_id, raised_by, reason, evidence_url, status, voting_deadline, kind, bond)
    values (
      p_market_id, p_user_id, p_reason, p_evidence_url, 'open',
      now() + (p_voting_hours || ' hours')::interval, 'dispute', p_bond
    )
    returning * into v_challenge;

  update markets set status = 'disputed' where id = p_market_id;

  return v_challenge;
end;
$$;
revoke execute on function public.raise_challenge(uuid, uuid, text, text, bigint, int) from anon, authenticated;
grant execute on function public.raise_challenge(uuid, uuid, text, text, bigint, int) to service_role;

-- ---------------------------------------------------------------------
-- settle_bonds: pays out both sides' bonds once a vote has decided who
-- was right. The loser's bond mostly goes to the winner (p_award_bps),
-- with the remainder kept by the treasury.
-- ---------------------------------------------------------------------
create or replace function public.settle_bonds(
  p_market_id uuid,
  p_challenge_id uuid,
  p_proposer_upheld boolean,
  p_award_bps int default 7000
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market markets%rowtype;
  v_challenge challenges%rowtype;
  v_proposer uuid;
  v_challenger uuid;
  v_proposer_bond bigint;
  v_challenger_bond bigint;
  v_loser_bond bigint;
  v_winner uuid;
  v_award bigint;
  v_user_balance bigint;
  v_treasury_balance bigint;
begin
  select * into v_market from markets where id = p_market_id;
  if not found then
    return;
  end if;

  if p_challenge_id is not null then
    select * into v_challenge from challenges where id = p_challenge_id;
  end if;

  v_proposer := v_market.resolution_proposed_by;
  v_proposer_bond := coalesce(v_market.resolution_bond, 0);
  -- An early-resolution "challenge" has the same author as the proposal,
  -- so there is no opposing party to reward.
  v_challenger := case when v_challenge.kind = 'dispute' then v_challenge.raised_by else null end;
  v_challenger_bond := case when v_challenge.kind = 'dispute' then coalesce(v_challenge.bond, 0) else 0 end;

  -- Return the winner's own bond.
  if p_proposer_upheld then
    if v_proposer is not null and v_proposer_bond > 0 then
      perform refund_bond(v_proposer, v_proposer_bond, p_market_id, 'resolution_bond', 'resolution bond returned');
    end if;
    v_loser_bond := v_challenger_bond;
    v_winner := v_proposer;
  else
    if v_challenger is not null and v_challenger_bond > 0 then
      perform refund_bond(v_challenger, v_challenger_bond, p_market_id, 'challenge_bond', 'challenge bond returned');
    end if;
    v_loser_bond := v_proposer_bond;
    v_winner := v_challenger;
  end if;

  if v_loser_bond > 0 then
    insert into treasury_logs (
      entry_type, user_id, points_delta, treasury_delta, treasury_balance_after, ref_table, ref_id, memo
    ) values (
      (case when p_proposer_upheld then 'challenge_bond_forfeited' else 'resolution_bond_forfeited' end)::treasury_entry_type,
      case when p_proposer_upheld then v_challenger else v_proposer end,
      0, 0, (select balance from treasury where id = 1), 'markets', p_market_id,
      'bond forfeited (DAO vote went the other way)'
    );

    v_award := (v_loser_bond * p_award_bps) / 10000;
    if v_winner is not null and v_award > 0 then
      update profiles set points_balance = points_balance + v_award, updated_at = now()
        where id = v_winner
        returning points_balance into v_user_balance;
      update treasury set balance = balance - v_award, updated_at = now()
        where id = 1
        returning balance into v_treasury_balance;

      insert into treasury_logs (
        entry_type, user_id, points_delta, treasury_delta,
        user_balance_after, treasury_balance_after, ref_table, ref_id, memo
      ) values (
        'bond_awarded', v_winner, v_award, -v_award,
        v_user_balance, v_treasury_balance, 'markets', p_market_id,
        'awarded from the losing side''s forfeited bond'
      );
    end if;
  end if;

  update markets set resolution_bond = 0 where id = p_market_id;
  if p_challenge_id is not null then
    update challenges set bond = 0 where id = p_challenge_id;
  end if;
end;
$$;

create or replace function public.refund_bond(
  p_user_id uuid,
  p_amount bigint,
  p_market_id uuid,
  p_entry_type text,
  p_memo text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_balance bigint;
  v_treasury_balance bigint;
begin
  update profiles set points_balance = points_balance + p_amount, updated_at = now()
    where id = p_user_id
    returning points_balance into v_user_balance;
  update treasury set balance = balance - p_amount, updated_at = now()
    where id = 1
    returning balance into v_treasury_balance;

  insert into treasury_logs (
    entry_type, user_id, points_delta, treasury_delta,
    user_balance_after, treasury_balance_after, ref_table, ref_id, memo
  ) values (
    p_entry_type::treasury_entry_type, p_user_id, p_amount, -p_amount,
    v_user_balance, v_treasury_balance, 'markets', p_market_id, p_memo
  );
end;
$$;

-- ---------------------------------------------------------------------
-- reward_correct_voters: flat bonus for the first N correct voters, plus
-- an equal split of the voters' share of the rake among all of them.
-- ---------------------------------------------------------------------
create or replace function public.reward_correct_voters(
  p_market_id uuid,
  p_final_outcome text,
  p_rake_share bigint,
  p_flat_reward bigint default 3,
  p_flat_reward_slots int default 10
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_voter record;
  v_correct_count int;
  v_per_voter bigint;
  v_rank int := 0;
  v_amount bigint;
  v_user_balance bigint;
  v_treasury_balance bigint;
begin
  select count(*) into v_correct_count
    from votes v
    join challenges c on c.id = v.challenge_id
    where c.market_id = p_market_id and v.voted_outcome = p_final_outcome;

  if v_correct_count = 0 then
    return;
  end if;

  v_per_voter := p_rake_share / v_correct_count;

  for v_voter in
    select v.user_id, v.created_at
      from votes v
      join challenges c on c.id = v.challenge_id
      where c.market_id = p_market_id and v.voted_outcome = p_final_outcome
      order by v.created_at asc
  loop
    v_rank := v_rank + 1;
    v_amount := v_per_voter + case when v_rank <= p_flat_reward_slots then p_flat_reward else 0 end;
    if v_amount <= 0 then
      continue;
    end if;

    update profiles set points_balance = points_balance + v_amount, updated_at = now()
      where id = v_voter.user_id
      returning points_balance into v_user_balance;
    update treasury set balance = balance - v_amount, updated_at = now()
      where id = 1
      returning balance into v_treasury_balance;

    insert into treasury_logs (
      entry_type, user_id, points_delta, treasury_delta,
      user_balance_after, treasury_balance_after, ref_table, ref_id, memo
    ) values (
      (case when v_rank <= p_flat_reward_slots then 'vote_reward' else 'voter_rake_share' end)::treasury_entry_type,
      v_voter.user_id, v_amount, -v_amount,
      v_user_balance, v_treasury_balance, 'markets', p_market_id,
      'correct resolution vote (rank ' || v_rank || ')'
    );
  end loop;
end;
$$;
