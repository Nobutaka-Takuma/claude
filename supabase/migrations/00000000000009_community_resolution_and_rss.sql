-- =========================================================================
-- Community resolution (bonded optimistic oracle) + RSS news ingestion
--
-- WHY: the sports API that was going to auto-resolve markets turned out to
-- be paywalled for current seasons, and user-created markets ("will player
-- X start?") were never resolvable by any API anyway. So resolution moves
-- to people: anyone may propose the result, and the existing 24h dispute
-- window + DAO vote decides whether it stands.
--
-- Letting anyone propose opens an obvious attack — propose the outcome
-- that pays your own bet and hope nobody looks within the window. The
-- guard is a bond: proposing locks up points that are returned if the
-- result stands, and forfeited to the treasury if a DAO vote overturns
-- it. Lying costs more than it pays as long as the bond exceeds what a
-- wrong settlement would earn the liar, which is why the bond is
-- configurable per deployment.
--
-- Note the asymmetry: challengers post no bond, so a frivolous challenge
-- costs its author nothing beyond the DAO's attention. Acceptable while
-- the community is small (a challenge only delays settlement, it can't
-- steal), but it is the obvious next thing to bond if griefing shows up.
-- =========================================================================

alter type treasury_entry_type add value if not exists 'resolution_bond';
alter type treasury_entry_type add value if not exists 'resolution_bond_forfeited';

alter table markets add column resolution_proposed_by uuid references profiles (id);
alter table markets add column resolution_bond bigint not null default 0;

-- RSS sync needs a stable per-item key to be idempotent, plus somewhere
-- to keep the link back to the original article.
alter table news_articles add column url text;
alter table news_articles add column external_ref text;
create unique index idx_news_articles_external_ref on news_articles (external_ref)
  where external_ref is not null;

-- ---------------------------------------------------------------------
-- upsert_news_article: called by the RSS sync batch, keyed on the feed
-- item's guid/link so re-running the sync refreshes rather than
-- duplicates.
-- ---------------------------------------------------------------------
create or replace function public.upsert_news_article(
  p_external_ref text,
  p_title text,
  p_body text,
  p_source text,
  p_category text,
  p_url text,
  p_published_at timestamptz
) returns public.news_articles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_article news_articles%rowtype;
begin
  insert into news_articles (external_ref, title, body, source, category, url, published_at)
    values (p_external_ref, p_title, p_body, p_source, p_category, p_url, p_published_at)
  on conflict (external_ref) where external_ref is not null
  do update set
    title = excluded.title,
    body = excluded.body,
    source = excluded.source,
    category = excluded.category,
    url = excluded.url,
    published_at = excluded.published_at
  returning * into v_article;

  return v_article;
end;
$$;
revoke execute on function public.upsert_news_article(text, text, text, text, text, text, timestamptz) from anon, authenticated;
grant execute on function public.upsert_news_article(text, text, text, text, text, text, timestamptz) to service_role;

-- ---------------------------------------------------------------------
-- submit_provisional_result: now takes an optional proposer + bond.
--
-- p_proposed_by null keeps the old operator behaviour (no bond, used by
-- admin tooling and the sports-result batch). A real user proposing pays
-- the bond up front.
-- ---------------------------------------------------------------------
create or replace function public.submit_provisional_result(
  p_market_id uuid,
  p_outcome text,
  p_dispute_window_minutes int default 1440,
  p_proposed_by uuid default null,
  p_bond bigint default 0
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
        dispute_deadline = now() + (p_dispute_window_minutes || ' minutes')::interval
    where id = p_market_id
    returning * into v_market;

  return v_market;
end;
$$;
revoke execute on function public.submit_provisional_result(uuid, text, int, uuid, bigint) from anon, authenticated;
grant execute on function public.submit_provisional_result(uuid, text, int, uuid, bigint) to service_role;

-- ---------------------------------------------------------------------
-- release_resolution_bond: returns the bond, or forfeits it to the
-- treasury when the DAO overturned the proposer's outcome.
-- ---------------------------------------------------------------------
create or replace function public.release_resolution_bond(
  p_market_id uuid,
  p_upheld boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market markets%rowtype;
  v_user_balance bigint;
  v_treasury_balance bigint;
begin
  select * into v_market from markets where id = p_market_id;
  if not found or v_market.resolution_proposed_by is null or v_market.resolution_bond <= 0 then
    return;
  end if;

  if p_upheld then
    update profiles
      set points_balance = points_balance + v_market.resolution_bond, updated_at = now()
      where id = v_market.resolution_proposed_by
      returning points_balance into v_user_balance;

    update treasury
      set balance = balance - v_market.resolution_bond, updated_at = now()
      where id = 1
      returning balance into v_treasury_balance;

    insert into treasury_logs (
      entry_type, user_id, points_delta, treasury_delta,
      user_balance_after, treasury_balance_after, ref_table, ref_id, memo
    ) values (
      'resolution_bond', v_market.resolution_proposed_by, v_market.resolution_bond, -v_market.resolution_bond,
      v_user_balance, v_treasury_balance, 'markets', p_market_id, 'resolution bond returned'
    );
  else
    -- Bond already sits in the treasury from submit time; forfeiting is
    -- just recording that it stays there.
    insert into treasury_logs (
      entry_type, user_id, points_delta, treasury_delta,
      treasury_balance_after, ref_table, ref_id, memo
    ) values (
      'resolution_bond_forfeited', v_market.resolution_proposed_by, 0, 0,
      (select balance from treasury where id = 1), 'markets', p_market_id,
      'resolution bond forfeited (DAO overturned the proposed result)'
    );
  end if;

  update markets set resolution_bond = 0 where id = p_market_id;
end;
$$;

-- ---------------------------------------------------------------------
-- finalize_expired_markets: same two sweeps as before, now releasing the
-- proposer's bond according to whether their outcome survived.
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
    -- Nobody disputed inside the window, so the proposer was right by
    -- default and gets their bond back.
    perform release_resolution_bond(m.id, true);
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

    perform release_resolution_bond(c.market_id, v_final_outcome = c.provisional_outcome);
    perform settle_market(c.market_id, v_final_outcome);
  end loop;
end;
$$;
