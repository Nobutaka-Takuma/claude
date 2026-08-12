-- =========================================================================
-- 結果報告に「根拠のコメント」を必須にする
--
-- 直前の変更で証跡URLを任意にした。報告のハードルは下がったが、そのままだと
-- 異議申し立て期間に何も判断材料がない状態が生まれる。「誰かが yes と言った」
-- だけでは、見ていなかった人は異議を出すかどうかを決められない。
--
-- URLを探すのは面倒でも、「何を見てそう判断したか」を一文書くのは面倒では
-- ない。URLの代わりにこちらを必須にする。
--
-- 10文字を下限にしているのは、必須欄が「あ」で埋められると意味がなくなる
-- ため。日本語なら短い一文がちょうど収まる長さ。
-- =========================================================================

alter table markets add column if not exists resolution_note text;

comment on column markets.resolution_note is
  '結果を報告した人が書いた根拠。証跡URLの代わりに必須。異議を出すかの判断材料になる。';

create or replace function public.submit_provisional_result(
  p_market_id uuid,
  p_outcome text,
  p_dispute_window_minutes int default 1440,
  p_proposed_by uuid default null,
  p_bond bigint default 0,
  p_evidence_url text default null,
  p_note text default null
) returns public.markets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market markets%rowtype;
  v_user_balance bigint;
  v_treasury_balance bigint;
  v_note text;
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

  -- 根拠のコメントは必須。自動取得（sync-results）も、スコアを含む文を
  -- 渡してくるので同じ経路を通る。
  v_note := nullif(trim(coalesce(p_note, '')), '');
  if v_note is null or char_length(v_note) < 10 then
    raise exception 'resolution_note_required';
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
        resolution_note = v_note,
        dispute_deadline = now() + (p_dispute_window_minutes || ' minutes')::interval
    where id = p_market_id
    returning * into v_market;

  return v_market;
end;
$$;

-- 引数が1つ増えたので、古いシグネチャは残しておくと呼び分けが曖昧になる。
drop function if exists public.submit_provisional_result(uuid, text, int, uuid, bigint, text);

revoke execute on function public.submit_provisional_result(uuid, text, int, uuid, bigint, text, text)
  from anon, authenticated;
grant execute on function public.submit_provisional_result(uuid, text, int, uuid, bigint, text, text)
  to service_role;
