-- =========================================================================
-- Seeded prize pool + richer market metadata
--
-- 1) SEED POOL — the "first bet is pointless" problem.
--
-- With the stake-back guarantee, a bet on a brand-new market pays exactly
-- the stake back until someone takes the other side: no downside, but no
-- upside either, so nobody has a reason to go first and markets never get
-- moving. The fix is to make the market creator seed real prize money:
-- most of the creation fee (MARKET_SEED_BPS, default 90%) is set aside as
-- seed_pool and paid to the winners on settlement, with only the
-- remainder kept by the treasury. A first bettor now has something to win
-- even with nothing on the other side.
--
-- Accounting: the whole creation fee moves into the treasury at creation
-- time and the seed portion moves back out when the market settles, so
-- the treasury is custodian of the seed rather than its owner.
--
-- 2) METADATA — resolves_at, league, matchweek.
--
-- kickoff_time is the *betting deadline* (it drives the auto-lock) and
-- keeps its name for continuity, but "when will this be decided" is a
-- separate thing a bettor wants to know before committing points, so
-- resolves_at is stored alongside it.
--
-- league/matchweek exist because the sports API that was going to
-- generate fixtures is paywalled for current seasons, so users create
-- those markets by hand. Capturing "J1リーグ / 第21節" as structured
-- fields rather than burying them in the title is what makes a pile of
-- user-created fixtures searchable.
-- =========================================================================

alter type treasury_entry_type add value if not exists 'market_seed_payout';

alter table markets add column seed_pool bigint not null default 0 check (seed_pool >= 0);
alter table markets add column resolves_at timestamptz;
alter table markets add column league text;
alter table markets add column matchweek int;

create index idx_markets_league on markets (league, matchweek) where league is not null;

-- ---------------------------------------------------------------------
-- create_market: now splits the creation fee into a seeded prize pool
-- and the treasury's cut, and records the extra metadata.
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
  p_seed_bps int default 9000
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
  if p_resolves_at is not null and p_resolves_at < p_closes_at then
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

  v_seed := (p_creation_cost * p_seed_bps) / 10000;

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
    v_seed := 0;
    select balance into v_treasury_balance from treasury where id = 1;
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
revoke execute on function public.create_market(uuid, text, text, timestamptz, jsonb, text, text, text, text, uuid, bigint, int, timestamptz, text, int, int) from anon, authenticated;
grant execute on function public.create_market(uuid, text, text, timestamptz, jsonb, text, text, text, text, uuid, bigint, int, timestamptz, text, int, int) to service_role;

-- ---------------------------------------------------------------------
-- settle_market: winners now share (losing pool - rake) PLUS the seed
-- pool the creator put up, which the treasury has been holding since
-- creation.
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

    -- No winners to pay, so the seed stays with the treasury (or went
    -- back to the creator with the refund above); either way it is no
    -- longer owed to anyone.
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

  -- Release the seed the treasury has been holding since creation. The
  -- per-bet payouts above already include each winner's share of it, so
  -- this is the matching treasury-side entry.
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
    set status = 'resolved', outcome = p_outcome, resolved_at = now(), seed_pool = 0
    where id = p_market_id
    returning * into v_market;

  return v_market;
end;
$$;
revoke execute on function public.settle_market(uuid, text) from anon, authenticated;
grant execute on function public.settle_market(uuid, text) to service_role;
