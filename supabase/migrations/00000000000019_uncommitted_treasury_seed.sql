-- =========================================================================
-- 初期賞金の引当を「まだ約束していない残高」に対して行う
--
-- upsert_auto_market は初期賞金を金庫から即座に引くのではなく、マーケット
-- の seed_pool に記録して精算時に払い出す（金庫は預かり役）。この設計自体
-- は変えないが、これまで引当の判定を
--
--   v_seed := least(希望額, 金庫の残高)
--
-- で行っていたため、既に他のマーケットへ約束済みの賞金を数えていなかった。
-- 1回の同期で作るマーケットが1〜2件のうちは表面化しないが、1週間分
-- （数十件）をまとめて作るようになると、金庫の残高を超える賞金を約束した
-- 状態が普通に起こる。精算のたびに払えないマーケットが出る、という形で
-- あとから効いてくる。
--
-- ここでは未精算のマーケットに約束済みの seed_pool を差し引いた「まだ
-- 自由に使える残高」に対して引き当てる。足りなければ賞金は減る（0にも
-- なる）が、払えない約束はしない。
--
-- 注: 有料作成（create_market）は作成料100ptを金庫が受け取ったうえで
-- その一部を賞金にするので、原資は自分で持ち込んでいる。ここで対象に
-- しているのは金庫が身銭を切る自動生成・管理者作成のぶん。
-- =========================================================================

-- 未精算のマーケットに約束済みで、まだ払い出されていない賞金の合計。
create or replace function public.committed_seed_pool()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(seed_pool), 0)::bigint
  from markets
  where seed_pool > 0
    and status in ('proposed', 'open', 'locked', 'pending_resolution', 'disputed');
$$;

comment on function public.committed_seed_pool() is
  '未精算マーケットに約束済みの初期賞金の合計。金庫の残高からこれを引いた額が、新しい賞金に使える。';

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
  v_committed bigint;
  v_available bigint;
begin
  v_options := jsonb_build_array(
    jsonb_build_object('key', 'home', 'label', p_home_team),
    jsonb_build_object('key', 'draw', 'label', '引き分け'),
    jsonb_build_object('key', 'away', 'label', p_away_team)
  );

  -- 既にあるマーケットには触れない（キックオフ時刻の修正だけ反映する）。
  -- ここで賞金を積み増すと、毎日の同期のたびに金庫が減っていく。
  select * into v_market from markets where external_ref = p_external_ref;
  if found then
    update markets
      set kickoff_time = p_kickoff_time,
          resolves_at = p_kickoff_time + p_resolve_after,
          title = p_title,
          league = coalesce(p_league, league),
          matchweek = coalesce(p_matchweek, matchweek)
      where id = v_market.id and status = 'open'
      returning * into v_market;
    if not found then
      select * into v_market from markets where external_ref = p_external_ref;
    end if;
    return v_market;
  end if;

  -- 金庫の残高から、他のマーケットに約束済みの賞金を差し引いた額が上限。
  select balance into v_treasury_balance from treasury where id = 1 for update;
  v_committed := committed_seed_pool();
  v_available := greatest(coalesce(v_treasury_balance, 0) - v_committed, 0);
  v_seed := least(greatest(p_seed_amount, 0), v_available);

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

revoke execute on function public.upsert_auto_market(
  text, text, text, text, timestamptz, text, text, int, bigint, interval
) from anon, authenticated;
grant execute on function public.upsert_auto_market(
  text, text, text, text, timestamptz, text, text, int, bigint, interval
) to service_role;
