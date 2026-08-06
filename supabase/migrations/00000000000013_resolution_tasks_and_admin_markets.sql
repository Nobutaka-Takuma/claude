-- Resolution as a paid job, plus operator-created markets.
--
-- Three changes that only make sense together:
--
-- 1. Reporting a result already costs a bond, but getting it right paid
--    nothing — the bond just came back. Nobody does unpaid homework, so a
--    correct report now earns a reward on top. It comes out of the 10pt
--    the treasury keeps from each market's creation fee, which is exactly
--    the money that market set aside for getting itself resolved.
--
-- 2. resolves_at stops being decorative. It's the moment the answer is
--    supposed to be knowable, so it becomes required at creation and, once
--    it passes, the market is advertised on /tasks as work to be claimed
--    rather than sitting silently in 'locked' hoping someone notices.
--
-- 3. A reported result now has to carry a link to the evidence. Disputes
--    were already evidence-backed; the original claim being a bare
--    assertion was the asymmetry.
--
-- Plus: admins can open a market without paying, with the treasury
-- putting up the seed money — the operator seeding the board on a quiet
-- day shouldn't require them to farm points first.

alter type treasury_entry_type add value if not exists 'resolution_reward';

alter table markets add column if not exists resolution_evidence_url text;

comment on column markets.resolution_evidence_url is
  'Link backing the reported result (news article, official page). Required when a user reports; admins may omit.';

-- ---------------------------------------------------------------------
-- Old signatures are dropped rather than replaced: each of these gains a
-- parameter, and `create or replace` with a different argument count
-- leaves an overload behind that makes every later call ambiguous.
-- ---------------------------------------------------------------------
drop function if exists public.create_market(uuid, text, text, timestamptz, jsonb, text, text, text, text, uuid, bigint, int, timestamptz, text, int, int);
drop function if exists public.propose_market(uuid, text, text, timestamptz, jsonb, text, text, text, text);
drop function if exists public.submit_provisional_result(uuid, text, int, uuid, bigint);
drop function if exists public.settle_bonds(uuid, uuid, boolean, int);
-- Superseded by settle_bonds since 0011; leaving it around invites
-- someone to call the one that doesn't pay the reward.
drop function if exists public.release_resolution_bond(uuid, boolean);

-- ---------------------------------------------------------------------
-- create_market: resolves_at required, and the seed can be set directly.
--
-- p_seed_amount lets an admin open a market for free while the treasury
-- still puts prize money on the board. No points move at creation time in
-- that case — the treasury is already the custodian of every seed, and
-- pays it out at settlement — so this is just recording what it owes.
-- ---------------------------------------------------------------------
create or replace function public.create_market(
  p_user_id uuid,
  p_title text,
  p_market_kind text,
  p_closes_at timestamptz,
  p_outcome_options jsonb,
  p_description text default null,
  p_category text default 'general',
  p_home_team text default null,
  p_away_team text default null,
  p_news_article_id uuid default null,
  p_creation_cost bigint default 100,
  p_creator_fee_bps int default 1000,
  p_resolves_at timestamptz default null,
  p_league text default null,
  p_matchweek int default null,
  p_seed_bps int default 9000,
  p_seed_amount bigint default null
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
  v_user_balance bigint;
  v_treasury_balance bigint;
  v_seed bigint;
begin
  if p_closes_at <= now() then
    raise exception 'kickoff_must_be_future';
  end if;
  if p_resolves_at is null then
    raise exception 'resolves_at_required';
  end if;
  if p_resolves_at < p_closes_at then
    raise exception 'resolves_at_before_close';
  end if;
  if p_market_kind not in ('match_winner', 'binary', 'multi_outcome') then
    raise exception 'invalid_market_kind';
  end if;
  if p_seed_bps < 0 or p_seed_bps > 10000 then
    raise exception 'invalid_seed_bps';
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

  if p_news_article_id is not null
     and not exists (select 1 from news_articles where id = p_news_article_id) then
    raise exception 'article_not_found';
  end if;

  select points_balance into v_user_balance from profiles where id = p_user_id for update;
  if not found then
    raise exception 'user_not_found';
  end if;
  if v_user_balance < p_creation_cost then
    raise exception 'insufficient_balance';
  end if;

  select balance into v_treasury_balance from treasury where id = 1 for update;

  if p_creation_cost > 0 then
    v_seed := coalesce(p_seed_amount, (p_creation_cost * p_seed_bps) / 10000);

    update profiles
      set points_balance = points_balance - p_creation_cost, updated_at = now()
      where id = p_user_id
      returning points_balance into v_user_balance;

    update treasury
      set balance = balance + p_creation_cost, updated_at = now()
      where id = 1
      returning balance into v_treasury_balance;
  else
    -- Free creation (admin). The seed is money the treasury promises to
    -- the winners, so it must actually have it.
    v_seed := coalesce(p_seed_amount, 0);
    if v_seed > coalesce(v_treasury_balance, 0) then
      raise exception 'insufficient_treasury';
    end if;
  end if;

  insert into markets (
    title, description, category, source, home_team, away_team, kickoff_time,
    status, created_by, market_kind, outcome_options, news_article_id,
    creator_fee_bps, approved_at, seed_pool, resolves_at, league, matchweek
  ) values (
    p_title, p_description, p_category,
    (case when p_news_article_id is not null then 'news_curated' else 'user_proposed' end)::market_source,
    case when p_market_kind = 'match_winner' then p_home_team else null end,
    case when p_market_kind = 'match_winner' then p_away_team else null end,
    p_closes_at, 'open', p_user_id, p_market_kind, v_options, p_news_article_id,
    p_creator_fee_bps, now(), v_seed, p_resolves_at, p_league, p_matchweek
  )
  returning * into v_market;

  if p_creation_cost > 0 then
    insert into treasury_logs (
      entry_type, user_id, points_delta, treasury_delta,
      user_balance_after, treasury_balance_after, ref_table, ref_id, memo
    ) values (
      'market_creation_fee', p_user_id, -p_creation_cost, p_creation_cost,
      v_user_balance, v_treasury_balance, 'markets', v_market.id,
      'market creation fee (' || v_seed || 'pt seeded as prize money)'
    );
  end if;

  return v_market;
end;
$$;
revoke execute on function public.create_market(uuid, text, text, timestamptz, jsonb, text, text, text, text, uuid, bigint, int, timestamptz, text, int, int, bigint) from anon, authenticated;
grant execute on function public.create_market(uuid, text, text, timestamptz, jsonb, text, text, text, text, uuid, bigint, int, timestamptz, text, int, int, bigint) to service_role;

-- ---------------------------------------------------------------------
-- propose_market: the free path needs a resolution date too, otherwise
-- an approved proposal opens with no scheduled moment to resolve it and
-- never becomes a task.
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
  p_away_team text default null,
  p_resolves_at timestamptz default null,
  p_league text default null,
  p_matchweek int default null
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
  if p_resolves_at is null then
    raise exception 'resolves_at_required';
  end if;
  if p_resolves_at < p_kickoff_time then
    raise exception 'resolves_at_before_close';
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
    status, created_by, market_kind, outcome_options, resolves_at, league, matchweek
  ) values (
    p_title, p_description, p_category, 'user_proposed',
    case when p_market_kind = 'match_winner' then p_home_team else null end,
    case when p_market_kind = 'match_winner' then p_away_team else null end,
    p_kickoff_time, 'proposed', p_user_id, p_market_kind, v_options,
    p_resolves_at, p_league, p_matchweek
  )
  returning * into v_market;

  return v_market;
end;
$$;
revoke execute on function public.propose_market(uuid, text, text, timestamptz, jsonb, text, text, text, text, timestamptz, text, int) from anon, authenticated;
grant execute on function public.propose_market(uuid, text, text, timestamptz, jsonb, text, text, text, text, timestamptz, text, int) to service_role;

-- ---------------------------------------------------------------------
-- submit_provisional_result: now records the evidence behind the claim.
--
-- A reported result decides where everyone's points go, so "trust me" is
-- not enough — a link is what makes the 24h dispute window usable by
-- someone who wasn't watching. Required from users; admins can skip it
-- because their override is already an out-of-band action.
-- ---------------------------------------------------------------------
create or replace function public.submit_provisional_result(
  p_market_id uuid,
  p_outcome text,
  p_dispute_window_minutes int default 1440,
  p_proposed_by uuid default null,
  p_bond bigint default 0,
  p_evidence_url text default null
) returns public.markets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market markets%rowtype;
  v_user_balance bigint;
  v_treasury_balance bigint;
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

  if p_proposed_by is not null then
    if p_evidence_url is null or length(trim(p_evidence_url)) = 0 then
      raise exception 'evidence_required';
    end if;
    if p_evidence_url !~* '^https?://' then
      raise exception 'invalid_evidence_url';
    end if;
  end if;

  if p_proposed_by is not null and p_bond > 0 then
    select points_balance into v_user_balance from profiles where id = p_proposed_by for update;
    if not found then
      raise exception 'user_not_found';
    end if;
    if v_user_balance < p_bond then
      raise exception 'insufficient_balance';
    end if;

    update profiles
      set points_balance = points_balance - p_bond, updated_at = now()
      where id = p_proposed_by
      returning points_balance into v_user_balance;

    update treasury
      set balance = balance + p_bond, updated_at = now()
      where id = 1
      returning balance into v_treasury_balance;

    insert into treasury_logs (
      entry_type, user_id, points_delta, treasury_delta,
      user_balance_after, treasury_balance_after, ref_table, ref_id, memo
    ) values (
      'resolution_bond', p_proposed_by, -p_bond, p_bond,
      v_user_balance, v_treasury_balance, 'markets', p_market_id, 'resolution bond posted'
    );
  end if;

  update markets
    set outcome = p_outcome,
        status = 'pending_resolution',
        resolution_source = case when p_proposed_by is null then 'operator' else 'community' end,
        resolution_proposed_by = p_proposed_by,
        resolution_bond = case when p_proposed_by is null then 0 else p_bond end,
        resolution_evidence_url = nullif(trim(coalesce(p_evidence_url, '')), ''),
        dispute_deadline = now() + (p_dispute_window_minutes || ' minutes')::interval
    where id = p_market_id
    returning * into v_market;

  return v_market;
end;
$$;
revoke execute on function public.submit_provisional_result(uuid, text, int, uuid, bigint, text) from anon, authenticated;
grant execute on function public.submit_provisional_result(uuid, text, int, uuid, bigint, text) to service_role;

-- ---------------------------------------------------------------------
-- settle_bonds: a correct report now pays.
--
-- The bond coming back was never an incentive — breaking even is what
-- happens if you do nothing. p_resolution_reward is the actual wage for
-- the work of checking a source and reporting it, paid only to whoever
-- put a bond up and turned out to be right.
-- ---------------------------------------------------------------------
create or replace function public.settle_bonds(
  p_market_id uuid,
  p_challenge_id uuid,
  p_proposer_upheld boolean,
  p_award_bps int default 7000,
  p_resolution_reward bigint default 10
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
  v_reward bigint;
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

  -- Reward for a correct report. Only paid to someone who actually put a
  -- bond at risk, so an operator override doesn't pay the operator.
  v_reward := case
                when p_proposer_upheld and v_proposer is not null and v_proposer_bond > 0
                  then greatest(p_resolution_reward, 0)
                else 0
              end;
  if v_reward > 0 then
    update profiles set points_balance = points_balance + v_reward, updated_at = now()
      where id = v_proposer
      returning points_balance into v_user_balance;
    update treasury set balance = balance - v_reward, updated_at = now()
      where id = 1
      returning balance into v_treasury_balance;

    insert into treasury_logs (
      entry_type, user_id, points_delta, treasury_delta,
      user_balance_after, treasury_balance_after, ref_table, ref_id, memo
    ) values (
      'resolution_reward', v_proposer, v_reward, -v_reward,
      v_user_balance, v_treasury_balance, 'markets', p_market_id,
      'reward for a correctly reported result'
    );
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
revoke execute on function public.settle_bonds(uuid, uuid, boolean, int, bigint) from anon, authenticated;
grant execute on function public.settle_bonds(uuid, uuid, boolean, int, bigint) to service_role;

-- ---------------------------------------------------------------------
-- finalize_expired_markets: pass the reward through to settle_bonds.
-- Redefined here only because its call sites changed arity.
-- ---------------------------------------------------------------------
drop function if exists public.finalize_expired_markets(int);

create or replace function public.finalize_expired_markets(
  p_bond_award_bps int default 7000,
  p_resolution_reward bigint default 10
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
    perform settle_bonds(m.id, null, true, p_bond_award_bps, p_resolution_reward);
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

    perform settle_bonds(c.market_id, c.id, v_final_outcome = c.provisional_outcome, p_bond_award_bps, p_resolution_reward);
    perform settle_market(c.market_id, v_final_outcome);
  end loop;
end;
$$;
revoke execute on function public.finalize_expired_markets(int, bigint) from anon, authenticated;
grant execute on function public.finalize_expired_markets(int, bigint) to service_role;

-- ---------------------------------------------------------------------
-- upsert_auto_market: fixture-generated markets need a resolution date
-- too, or they open and then never surface as work for anyone.
-- A football match is over roughly two hours after kickoff; the extra
-- hour is slack for a delayed report.
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
    status, market_kind, outcome_options, resolves_at
  ) values (
    p_title, p_category, 'api_auto', p_external_ref, p_home_team, p_away_team, p_kickoff_time,
    'open', 'match_winner', v_options, p_kickoff_time + interval '3 hours'
  )
  on conflict (external_ref) where external_ref is not null
  do update set
    title = excluded.title,
    home_team = excluded.home_team,
    away_team = excluded.away_team,
    kickoff_time = excluded.kickoff_time,
    outcome_options = excluded.outcome_options,
    resolves_at = excluded.resolves_at
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

-- Existing markets have no resolution date; default them to a day after
-- their kickoff so they can still become resolution tasks instead of
-- being stuck outside the new flow.
update markets
  set resolves_at = kickoff_time + interval '1 day'
  where resolves_at is null;
