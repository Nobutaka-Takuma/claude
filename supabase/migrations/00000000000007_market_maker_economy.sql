-- =========================================================================
-- Market-maker economy
--
-- Turns market creation into a paid, rewarded act so users have a reason
-- to create markets people actually want to bet on:
--
--   * Creating a market costs MARKET_CREATION_COST points (default 100),
--     paid into the treasury. This is the anti-spam gate that replaces
--     "wait for 3 approval votes" — a paid market opens immediately.
--   * When that market settles, the creator earns creator_fee_bps of the
--     rake (default 1000 = 10% of the terasen). Popular markets generate
--     a bigger losing pool, so a bigger rake, so a bigger creator cut.
--
-- The free propose_market + vote-to-open path from 0003/0005 stays as-is
-- for users who don't want to spend points; it earns no creator fee.
--
-- Also adds the signup bonus (default 1000 points, granted from the
-- treasury) so a new account can actually participate immediately.
-- =========================================================================

alter type treasury_entry_type add value if not exists 'market_creation_fee';
alter type treasury_entry_type add value if not exists 'creator_fee';
alter type treasury_entry_type add value if not exists 'signup_bonus';

-- 1000 bps = 10% of the rake goes to whoever created the market.
-- Only paid, user-created markets set this; api_auto markets leave it 0
-- so their whole rake stays with the treasury.
alter table markets add column creator_fee_bps int not null default 0
  check (creator_fee_bps between 0 and 10000);

-- ---------------------------------------------------------------------
-- grant_signup_bonus: welcome points, drawn from the treasury.
--
-- Deliberately never fails a signup: if the treasury is short, it grants
-- whatever is left (possibly nothing) rather than blocking registration.
-- ---------------------------------------------------------------------
create or replace function public.grant_signup_bonus(
  p_user_id uuid,
  p_amount bigint default 1000
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_treasury_balance bigint;
  v_granted bigint;
  v_user_balance bigint;
begin
  if p_amount <= 0 then
    return 0;
  end if;

  select balance into v_treasury_balance from treasury where id = 1 for update;
  v_granted := least(p_amount, coalesce(v_treasury_balance, 0));
  if v_granted <= 0 then
    return 0;
  end if;

  update profiles
    set points_balance = points_balance + v_granted, updated_at = now()
    where id = p_user_id
    returning points_balance into v_user_balance;
  if not found then
    raise exception 'user_not_found';
  end if;

  update treasury
    set balance = balance - v_granted, updated_at = now()
    where id = 1
    returning balance into v_treasury_balance;

  insert into treasury_logs (
    entry_type, user_id, points_delta, treasury_delta,
    user_balance_after, treasury_balance_after, memo
  ) values (
    'signup_bonus', p_user_id, v_granted, -v_granted,
    v_user_balance, v_treasury_balance, 'welcome bonus'
  );

  return v_granted;
end;
$$;
revoke execute on function public.grant_signup_bonus(uuid, bigint) from anon, authenticated;
grant execute on function public.grant_signup_bonus(uuid, bigint) to service_role;

-- ---------------------------------------------------------------------
-- create_market: paid creation that opens the market immediately.
--
-- Same validation as propose_market (see 0005) plus the point charge.
-- p_news_article_id optionally attaches the market to the news story it
-- was created from, which is what the /news feed uses.
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
  p_creator_fee_bps int default 1000
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
begin
  if p_closes_at <= now() then
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

  if p_news_article_id is not null
     and not exists (select 1 from news_articles where id = p_news_article_id) then
    raise exception 'article_not_found';
  end if;

  -- Charge the creation fee before opening anything, so a user who can't
  -- afford it never ends up with a half-created market.
  select points_balance into v_user_balance from profiles where id = p_user_id for update;
  if not found then
    raise exception 'user_not_found';
  end if;
  if v_user_balance < p_creation_cost then
    raise exception 'insufficient_balance';
  end if;

  if p_creation_cost > 0 then
    update profiles
      set points_balance = points_balance - p_creation_cost, updated_at = now()
      where id = p_user_id
      returning points_balance into v_user_balance;

    update treasury
      set balance = balance + p_creation_cost, updated_at = now()
      where id = 1
      returning balance into v_treasury_balance;
  else
    select balance into v_treasury_balance from treasury where id = 1;
  end if;

  insert into markets (
    title, description, category, source, home_team, away_team, kickoff_time,
    status, created_by, market_kind, outcome_options, news_article_id,
    creator_fee_bps, approved_at
  ) values (
    p_title, p_description, p_category,
    (case when p_news_article_id is not null then 'news_curated' else 'user_proposed' end)::market_source,
    case when p_market_kind = 'match_winner' then p_home_team else null end,
    case when p_market_kind = 'match_winner' then p_away_team else null end,
    p_closes_at, 'open', p_user_id, p_market_kind, v_options, p_news_article_id,
    p_creator_fee_bps, now()
  )
  returning * into v_market;

  if p_creation_cost > 0 then
    insert into treasury_logs (
      entry_type, user_id, points_delta, treasury_delta,
      user_balance_after, treasury_balance_after, ref_table, ref_id, memo
    ) values (
      'market_creation_fee', p_user_id, -p_creation_cost, p_creation_cost,
      v_user_balance, v_treasury_balance, 'markets', v_market.id, 'market creation fee'
    );
  end if;

  return v_market;
end;
$$;
revoke execute on function public.create_market(uuid, text, text, timestamptz, jsonb, text, text, text, text, uuid, bigint, int) from anon, authenticated;
grant execute on function public.create_market(uuid, text, text, timestamptz, jsonb, text, text, text, text, uuid, bigint, int) to service_role;

-- ---------------------------------------------------------------------
-- settle_market: same payout math as 0005 (stake-back guarantee), with
-- the rake now split between the treasury and the market's creator.
--
-- On a void, the creation fee is refunded to the creator — a cancelled
-- market isn't the creator's failure, so charging them for it would
-- punish the wrong person.
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
  v_creator_fee bigint;
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

    -- Give the creator their creation fee back on a void.
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

  -- Split the rake: creator's cut first, remainder to the treasury.
  v_creator_fee := 0;
  if v_rake > 0 and v_market.created_by is not null and v_market.creator_fee_bps > 0 then
    v_creator_fee := (v_rake * v_market.creator_fee_bps) / 10000;
  end if;

  if v_rake - v_creator_fee > 0 then
    update treasury set balance = balance + (v_rake - v_creator_fee), updated_at = now()
      where id = 1
      returning balance into v_treasury_balance;

    insert into treasury_logs (
      entry_type, user_id, points_delta, treasury_delta,
      treasury_balance_after, ref_table, ref_id, memo
    ) values (
      'rake_collected', null, 0, v_rake - v_creator_fee,
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

  update markets
    set status = 'resolved', outcome = p_outcome, resolved_at = now()
    where id = p_market_id
    returning * into v_market;

  return v_market;
end;
$$;
revoke execute on function public.settle_market(uuid, text) from anon, authenticated;
grant execute on function public.settle_market(uuid, text) to service_role;
