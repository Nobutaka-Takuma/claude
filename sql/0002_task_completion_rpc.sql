-- =========================================================================
-- complete_task: atomically verifies + rewards a task completion
--
-- Called only from trusted server code (Next.js Route Handlers using the
-- Supabase service-role key), never directly from the browser. SECURITY
-- DEFINER lets it bypass RLS to update profiles/treasury, while every
-- check below (active window, per-user limit, idempotency) still runs
-- inside the same transaction as the balance updates, so a double
-- submission or a race between two requests can never double-pay.
-- =========================================================================
create or replace function public.complete_task(
  p_user_id uuid,
  p_task_id uuid,
  p_idempotency_key text,
  p_verification jsonb default '{}'::jsonb
) returns public.treasury_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task tasks%rowtype;
  v_existing_count int;
  v_reward bigint;
  v_user_balance bigint;
  v_treasury_balance bigint;
  v_log treasury_logs%rowtype;
begin
  if exists (select 1 from task_completions where idempotency_key = p_idempotency_key) then
    raise exception 'duplicate_completion';
  end if;

  select * into v_task from tasks where id = p_task_id for update;
  if not found then
    raise exception 'task_not_found';
  end if;
  if not v_task.is_active then
    raise exception 'task_inactive';
  end if;
  if v_task.starts_at is not null and now() < v_task.starts_at then
    raise exception 'task_not_started';
  end if;
  if v_task.ends_at is not null and now() > v_task.ends_at then
    raise exception 'task_ended';
  end if;

  if v_task.max_completions_per_user is not null then
    select count(*) into v_existing_count
      from task_completions
      where task_id = p_task_id and user_id = p_user_id and status = 'verified';
    if v_existing_count >= v_task.max_completions_per_user then
      raise exception 'completion_limit_reached';
    end if;
  end if;

  v_reward := v_task.reward_points;

  -- Row locks below serialize concurrent completions for the same user,
  -- preventing lost updates on points_balance / treasury.balance.
  perform 1 from profiles where id = p_user_id for update;
  if not found then
    raise exception 'user_not_found';
  end if;
  perform 1 from treasury where id = 1 for update;

  update profiles
    set points_balance = points_balance + v_reward, updated_at = now()
    where id = p_user_id
    returning points_balance into v_user_balance;

  update treasury
    set balance = balance + v_reward, updated_at = now()
    where id = 1
    returning balance into v_treasury_balance;

  insert into task_completions (task_id, user_id, status, reward_points, idempotency_key, verification, verified_at)
    values (p_task_id, p_user_id, 'verified', v_reward, p_idempotency_key, p_verification, now());

  insert into treasury_logs (
    entry_type, user_id, points_delta, treasury_delta,
    user_balance_after, treasury_balance_after, ref_table, ref_id, memo
  ) values (
    'task_reward', p_user_id, v_reward, v_reward,
    v_user_balance, v_treasury_balance, 'tasks', p_task_id, 'task completion reward'
  )
  returning * into v_log;

  return v_log;
end;
$$;

-- Only server-side callers (service role) should invoke this; revoke from
-- the client-facing anon/authenticated roles that RLS policies normally cover.
revoke execute on function public.complete_task(uuid, uuid, text, jsonb) from anon, authenticated;
grant execute on function public.complete_task(uuid, uuid, text, jsonb) to service_role;
