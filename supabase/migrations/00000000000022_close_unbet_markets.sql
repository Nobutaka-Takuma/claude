-- =========================================================================
-- 誰も予想しなかったマーケットは、判定せずに終了する
--
-- これまでは締切を過ぎたマーケットが一律 locked になり、判定予定日時を
-- 過ぎると /tasks に「結果の入力」として並んでいた。予想が1件もない
-- マーケットにもこれが起きるので、
--
--   * 誰の得にもならない作業がタスク一覧に溜まる
--   * 報告した人には保証金と報酬のやりとりが発生する（金庫の持ち出し）
--   * 自動生成した試合マーケットは大半が無風なので、放置するとタスク一覧が
--     それだけで埋まる
--
-- という状態になっていた。締切時点で予想が0件なら、その後どうなっても
-- 誰の残高も動かない。判定する意味がないので、そのまま終了させる。
--
-- 終了のさせ方は settle_market(..., 'void') と同じ扱いにする。作成料は
-- 作成者に返し（作成者に落ち度はない）、初期賞金の約束は解放する。
-- ただし status は 'resolved' ではなく 'cancelled' にする。結果が出た
-- わけではないので、「確定・結果なし」より「中止」のほうが実態に合う。
-- =========================================================================

comment on column markets.resolution_note is
  '結果の根拠。人が報告した場合はその説明、システムが終了させた場合はその理由が入る。';

create or replace function public.close_unbet_markets()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market markets%rowtype;
  v_refund bigint;
  v_user_balance bigint;
  v_treasury_balance bigint;
  v_closed int := 0;
begin
  -- 'open' と 'locked' の両方を対象にする。前者はこれから締切を迎えるもの、
  -- 後者はこの変更より前に締切を過ぎて溜まっていたもの。
  for v_market in
    select * from markets m
    where m.status in ('open', 'locked')
      and m.kickoff_time <= now()
      and not exists (
        select 1 from bets b where b.market_id = m.id and b.status = 'active'
      )
    for update
  loop
    -- 作成料の返金。settle_market の void と同じ計算で、過去の返金分
    -- （+points_delta で記録される）と相殺されるので二重には返らない。
    if v_market.created_by is not null then
      select coalesce(sum(-points_delta), 0) into v_refund
        from treasury_logs
        where entry_type = 'market_creation_fee'
          and ref_table = 'markets'
          and ref_id = v_market.id;

      if v_refund > 0 then
        update profiles
          set points_balance = points_balance + v_refund, updated_at = now()
          where id = v_market.created_by
          returning points_balance into v_user_balance;

        update treasury
          set balance = balance - v_refund, updated_at = now()
          where id = 1
          returning balance into v_treasury_balance;

        insert into treasury_logs (
          entry_type, user_id, points_delta, treasury_delta,
          user_balance_after, treasury_balance_after, ref_table, ref_id, memo
        ) values (
          'market_creation_fee', v_market.created_by, v_refund, -v_refund,
          v_user_balance, v_treasury_balance, 'markets', v_market.id,
          'creation fee refunded (no one predicted)'
        );
      end if;
    end if;

    -- seed_pool を 0 にすることで、金庫が約束していた初期賞金が解放される
    -- （committed_seed_pool() は終了したマーケットを数えない）。
    update markets
      set status = 'cancelled',
          resolved_at = now(),
          seed_pool = 0,
          resolution_note = '予想した人がいなかったため、判定せずに終了しました。'
      where id = v_market.id;

    v_closed := v_closed + 1;
  end loop;

  return v_closed;
end;
$$;

revoke execute on function public.close_unbet_markets() from anon, authenticated;
grant execute on function public.close_unbet_markets() to service_role;

-- sync_market_status から呼ぶ。マーケットを読むたびに走る遅延cronの一部に
-- しておけば、呼び出し側を1か所も変えずに済む。
--
-- 順序が大事: 先に無風のマーケットを終了させてから、残りを locked にする。
-- 逆にすると、予想0件のマーケットが一度 locked を経由してタスク一覧に
-- 顔を出す瞬間ができる。
create or replace function public.sync_market_status() returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform close_unbet_markets();

  update markets
    set status = 'locked'
    where status = 'open' and kickoff_time <= now();
end;
$$;
