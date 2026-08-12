-- =========================================================================
-- 結果報告の証跡URLを任意にする
--
-- これまでは結果を報告するときに証跡URLが必須だった。厳密さの面では正しい
-- が、実際には「結果は分かっているのに、貼れるURLを探すのが面倒で報告し
-- ない」を大量に生む。報告されないマーケットは誰の得にもならない。
--
-- 異議申し立てが出た時点で初めて出典が争点になるので、そこで貼れれば足りる。
-- URLが入っている場合の形式チェックは残す（http(s) 以外を証跡として
-- 表示すると、リンクとして機能しないものが証跡欄に並ぶことになる）。
-- =========================================================================

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

  -- 証跡URLは任意。ただし入っているなら、リンクとして開ける形式であること。
  if p_evidence_url is not null and length(trim(p_evidence_url)) > 0
     and p_evidence_url !~* '^https?://' then
    raise exception 'invalid_evidence_url';
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
