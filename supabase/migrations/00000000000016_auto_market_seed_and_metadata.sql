-- Auto-generated fixture markets, with prize money and searchable metadata.
--
-- Two problems with what upsert_auto_market produced before:
--
-- 1. seed_pool was 0, so the first person to bet could only ever break
--    even — stake back, no profit. That's the exact problem MARKET_SEED_BPS
--    was introduced to solve for user-created markets, and a board full of
--    automatically created matches nobody has a reason to bet on first is
--    worse than an empty one. The treasury funds these the same way it
--    funds an admin's market: it holds the seed until settlement and pays
--    it to the winners then.
--
-- 2. league, matchweek and category were dropped on the floor, so
--    fixtures couldn't be filtered by competition — the search built for
--    exactly that case.

create or replace function public.upsert_auto_market(
  p_external_ref text,
  p_title text,
  p_home_team text,
  p_away_team text,
  p_kickoff_time timestamptz,
  p_category text default 'soccer',
  p_league text default null,
  p_matchweek int default null,
  p_seed_amount bigint default 0,
  p_resolve_after interval default interval '3 hours'
) returns public.markets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market markets%rowtype;
  v_options jsonb;
  v_seed bigint;
  v_treasury_balance bigint;
begin
  v_options := jsonb_build_array(
    jsonb_build_object('key', 'home', 'label', p_home_team),
    jsonb_build_object('key', 'draw', 'label', '引き分け'),
    jsonb_build_object('key', 'away', 'label', p_away_team)
  );

  -- Only seed on first insert. Re-running the sync must not top up the
  -- prize pot of a market that already exists, or a daily cron would
  -- quietly drain the treasury.
  select * into v_market from markets where external_ref = p_external_ref;
  if found then
    update markets
      set title = p_title,
          home_team = p_home_team,
          away_team = p_away_team,
          kickoff_time = p_kickoff_time,
          resolves_at = p_kickoff_time + p_resolve_after,
          outcome_options = v_options,
          league = coalesce(p_league, league),
          matchweek = coalesce(p_matchweek, matchweek),
          category = p_category
      where external_ref = p_external_ref
        and status = 'open'
      returning * into v_market;

    if not found then
      select * into v_market from markets where external_ref = p_external_ref;
    end if;
    return v_market;
  end if;

  select balance into v_treasury_balance from treasury where id = 1 for update;
  v_seed := least(greatest(p_seed_amount, 0), coalesce(v_treasury_balance, 0));

  insert into markets (
    title, category, source, external_ref, home_team, away_team, kickoff_time,
    status, market_kind, outcome_options, resolves_at, league, matchweek, seed_pool
  ) values (
    p_title, p_category, 'api_auto', p_external_ref, p_home_team, p_away_team, p_kickoff_time,
    'open', 'match_winner', v_options, p_kickoff_time + p_resolve_after, p_league, p_matchweek, v_seed
  )
  returning * into v_market;

  return v_market;
end;
$$;
revoke execute on function public.upsert_auto_market(text, text, text, text, timestamptz, text, text, int, bigint, interval) from anon, authenticated;
grant execute on function public.upsert_auto_market(text, text, text, text, timestamptz, text, text, int, bigint, interval) to service_role;
