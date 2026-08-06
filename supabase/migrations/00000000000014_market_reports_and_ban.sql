-- Community takedown of markets that shouldn't exist.
--
-- Letting anyone open a market is the point of the thing, and it is also
-- the obvious way for the app to end up hosting a bet on whether a named
-- person dies. An operator-only report queue doesn't work at community
-- speed — the market is live while a human sleeps — so the same mechanism
-- that resolves markets handles removal: enough people say it violates
-- the rules and it stops, immediately, with every stake returned.
--
-- What the numbers mean:
--   * the creator's 100pt creation fee is FORFEITED, not refunded. Voiding
--     for an honest reason (a cancelled match) returns it; being removed
--     for a rule violation must not, or opening a prohibited market is
--     free to attempt.
--   * bettors are refunded in full. They broke no rule.
--   * bonds posted by result reporters and challengers are returned for
--     the same reason.
--   * each reporter earns a small reward out of the forfeited fee, so
--     flagging something is worth the ten seconds it takes.
--
-- The obvious attack is the mirror image: three accounts colluding to
-- destroy a legitimate market and collect the reward. That's why the
-- reward is small change rather than a share of the fee, why reports are
-- one-per-user, and why an admin can dismiss a market's reports and
-- immunise it from the same brigade.

alter type treasury_entry_type add value if not exists 'report_reward';
alter type treasury_entry_type add value if not exists 'market_fee_forfeited';

alter table markets add column if not exists banned_at timestamptz;
alter table markets add column if not exists ban_reason text;
-- Set when an admin reviews reports and finds nothing wrong. Reports
-- filed before this point no longer count toward the threshold, so a
-- coordinated group can't simply wait for one more vote.
alter table markets add column if not exists reports_dismissed_at timestamptz;

comment on column markets.banned_at is
  'When the community removed this market for violating the guidelines. Distinguishes a takedown from an ordinary void.';

create table if not exists market_reports (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references markets(id),
  user_id uuid not null references profiles(id),
  -- Kept as text with a check rather than an enum: the list of things
  -- people report will change faster than the schema should.
  category text not null check (category in (
    'violence',        -- 危害・暴力の扇動、特定個人の死傷を賭けの対象にする
    'personal',        -- 私人のプライバシー・私生活
    'discrimination',  -- 差別・ヘイト
    'sexual',          -- 性的・わいせつ
    'minor',           -- 未成年に関するもの
    'illegal',         -- 違法行為の助長
    'manipulation',    -- 当事者が結果を操作できる
    'unverifiable',    -- 客観的に判定できない
    'spam',            -- スパム・重複・荒らし
    'other'
  )),
  note text,
  created_at timestamptz not null default now(),
  unique (market_id, user_id)
);

create index if not exists idx_market_reports_market on market_reports(market_id);

alter table market_reports enable row level security;

-- Reports are visible to the reporter and to admins only: publishing who
-- flagged what invites retaliation against reporters.
create policy "users read their own reports" on market_reports
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- ban_market: stop a market, refund everyone who staked, pay reporters.
-- ---------------------------------------------------------------------
create or replace function public.ban_market(
  p_market_id uuid,
  p_reason text default null,
  p_reward_per_reporter bigint default 3
) returns public.markets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market markets%rowtype;
  v_bet record;
  v_reporter record;
  v_forfeited bigint;
  v_user_balance bigint;
  v_treasury_balance bigint;
begin
  select * into v_market from markets where id = p_market_id for update;
  if not found then
    raise exception 'market_not_found';
  end if;
  if v_market.status not in ('proposed', 'open', 'locked', 'pending_resolution', 'disputed') then
    raise exception 'market_not_bannable';
  end if;

  -- Everyone who staked gets their points back. They followed the rules;
  -- the market was the problem.
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
      v_user_balance, (select balance from treasury where id = 1), 'bets', v_bet.id,
      'market removed by community report, stake refunded'
    );
  end loop;

  -- Bonds go back too: reporting a result or disputing one is unrelated
  -- to whether the market should have existed.
  if v_market.resolution_proposed_by is not null and coalesce(v_market.resolution_bond, 0) > 0 then
    perform refund_bond(
      v_market.resolution_proposed_by, v_market.resolution_bond, p_market_id,
      'resolution_bond', 'resolution bond returned (market removed)'
    );
  end if;
  for v_reporter in
    select raised_by, bond from challenges
    where market_id = p_market_id and status = 'open' and coalesce(bond, 0) > 0
  loop
    perform refund_bond(
      v_reporter.raised_by, v_reporter.bond, p_market_id,
      'challenge_bond', 'challenge bond returned (market removed)'
    );
  end loop;
  update challenges set status = 'withdrawn'::challenge_status, resolved_at = now()
    where market_id = p_market_id and status = 'open';

  -- The creation fee stays with the treasury. Recorded explicitly so the
  -- ledger shows a penalty rather than a fee that quietly wasn't returned.
  select coalesce(sum(-points_delta), 0) into v_forfeited
    from treasury_logs
    where entry_type = 'market_creation_fee' and ref_table = 'markets' and ref_id = p_market_id;

  if v_forfeited > 0 then
    insert into treasury_logs (
      entry_type, user_id, points_delta, treasury_delta,
      treasury_balance_after, ref_table, ref_id, memo
    ) values (
      'market_fee_forfeited', v_market.created_by, 0, 0,
      (select balance from treasury where id = 1), 'markets', p_market_id,
      'creation fee forfeited (market removed by community report)'
    );
  end if;

  -- Pay the people who flagged it.
  if p_reward_per_reporter > 0 then
    for v_reporter in
      select user_id from market_reports
      where market_id = p_market_id
        and (v_market.reports_dismissed_at is null or created_at > v_market.reports_dismissed_at)
    loop
      update profiles set points_balance = points_balance + p_reward_per_reporter, updated_at = now()
        where id = v_reporter.user_id
        returning points_balance into v_user_balance;
      update treasury set balance = balance - p_reward_per_reporter, updated_at = now()
        where id = 1
        returning balance into v_treasury_balance;
      insert into treasury_logs (
        entry_type, user_id, points_delta, treasury_delta,
        user_balance_after, treasury_balance_after, ref_table, ref_id, memo
      ) values (
        'report_reward', v_reporter.user_id, p_reward_per_reporter, -p_reward_per_reporter,
        v_user_balance, v_treasury_balance, 'markets', p_market_id, 'reward for reporting a prohibited market'
      );
    end loop;
  end if;

  update markets
    set status = 'cancelled',
        banned_at = now(),
        ban_reason = p_reason,
        resolved_at = now(),
        seed_pool = 0,
        resolution_bond = 0
    where id = p_market_id
    returning * into v_market;

  return v_market;
end;
$$;
revoke execute on function public.ban_market(uuid, text, bigint) from anon, authenticated;
grant execute on function public.ban_market(uuid, text, bigint) to service_role;

-- ---------------------------------------------------------------------
-- report_market: one report per user, and the report that reaches the
-- threshold performs the takedown in the same transaction.
-- ---------------------------------------------------------------------
create or replace function public.report_market(
  p_user_id uuid,
  p_market_id uuid,
  p_category text,
  p_note text default null,
  p_threshold int default 3,
  p_reward_per_reporter bigint default 3
) returns public.markets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market markets%rowtype;
  v_count int;
begin
  select * into v_market from markets where id = p_market_id for update;
  if not found then
    raise exception 'market_not_found';
  end if;
  if v_market.status not in ('proposed', 'open', 'locked', 'pending_resolution', 'disputed') then
    raise exception 'market_not_bannable';
  end if;
  -- Reporting your own market is not a signal, and would let a creator
  -- farm the reward by reporting themselves.
  if v_market.created_by = p_user_id then
    raise exception 'cannot_report_own_market';
  end if;

  begin
    insert into market_reports (market_id, user_id, category, note)
      values (p_market_id, p_user_id, p_category, nullif(trim(coalesce(p_note, '')), ''));
  exception when unique_violation then
    raise exception 'already_reported';
  end;

  select count(*) into v_count
    from market_reports
    where market_id = p_market_id
      and (v_market.reports_dismissed_at is null or created_at > v_market.reports_dismissed_at);

  if v_count >= p_threshold then
    return ban_market(
      p_market_id,
      'コミュニティの通報' || v_count || '件により停止されました',
      p_reward_per_reporter
    );
  end if;

  return v_market;
end;
$$;
revoke execute on function public.report_market(uuid, uuid, text, text, int, bigint) from anon, authenticated;
grant execute on function public.report_market(uuid, uuid, text, text, int, bigint) to service_role;

-- ---------------------------------------------------------------------
-- dismiss_market_reports: an admin reviewed the reports and found the
-- market acceptable. Existing reports stop counting, so the market can't
-- be taken down by one more vote from the same group.
-- ---------------------------------------------------------------------
create or replace function public.dismiss_market_reports(p_market_id uuid)
returns public.markets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market markets%rowtype;
begin
  update markets set reports_dismissed_at = now() where id = p_market_id returning * into v_market;
  if not found then
    raise exception 'market_not_found';
  end if;
  return v_market;
end;
$$;
revoke execute on function public.dismiss_market_reports(uuid) from anon, authenticated;
grant execute on function public.dismiss_market_reports(uuid) to service_role;
