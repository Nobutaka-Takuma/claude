-- =========================================================================
-- スポンサー・案件（キャンペーン）とマイクロワーク
--
-- ここまでのタスクは「広告を見た/アンケートに答えた」だけで、報酬ポイント
-- はどこからも裏付けのないまま発行されていた（complete_task はユーザーと
-- 金庫に同額を加算するだけ）。実際に運営したいのはその逆で、
--
--   広告主・代理店・発注者  --(円)-->  運営  --(ポイント)-->  ユーザー
--
-- という流れになる。つまりポイントは「労働が価値を生んだ」という建前では
-- なく、実際に受け取った円を原資に発行される。
--
-- 通貨をひとつの台帳に混ぜないこと。これが本ファイルの一番重要な設計判断
-- で、treasury_logs はこれまで通り「ポイントだけ」の台帳のままにする。円
-- は campaigns / campaign_payments / task_completions.revenue_yen 側だけで
-- 扱い、両者を突き合わせるのは campaign_economics ビューの役目にする。
-- （ポイントと円を同じ数量カラムに入れると、あとから残高の意味が誰にも
-- 説明できなくなる。）
--
-- 構成:
--   sponsors            広告主・代理店・発注者
--   campaigns           1件の商談＝案件。1件あたりの受取額と予算上限を持つ
--   campaign_payments   実際に入金された円（未収の可視化用）
--   tasks.campaign_id   タスクがどの案件に紐づくか
--   tasks.verification_mode  成果物の検収方法（auto/review/quorum/none）
--   task_peer_reviews   相互チェック（quorum）の投票
--
-- 検収方法をタスクごとに選べるのが要点。広告視聴はネットワークの SSV を
-- 信用して自動承認できるが、「この写真を分類して」のような作業を無検収で
-- 報酬にすると、その瞬間にポイント製造機になる。人手の要る作業は既定で
-- 相互チェック（quorum）か運営レビュー（review）を通す。
-- =========================================================================

alter type task_type add value if not exists 'micro_work';
alter type treasury_entry_type add value if not exists 'peer_review_reward';

-- -------------------------------------------------------------------------
-- sponsors: お金を出す側
-- -------------------------------------------------------------------------
create table if not exists sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- 直接の広告主か、代理店経由か、広告ではない業務委託か。請求先と
  -- 単価交渉の相手が変わるので、案件ではなくスポンサー側に持たせる。
  kind text not null default 'advertiser' check (kind in (
    'advertiser',   -- 広告主
    'agency',       -- 広告代理店・ASP
    'client',       -- 業務委託の発注者（広告以外のマイクロワーク）
    'internal'      -- 運営自身（原資なしの販促タスク）
  )),
  contact text,
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table sponsors is
  '広告主・代理店・業務委託の発注者。1社が複数の案件(campaigns)を持つ。';

-- -------------------------------------------------------------------------
-- campaigns: 1件の商談。「何件までやらせて、1件いくら受け取るか」
-- -------------------------------------------------------------------------
create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  sponsor_id uuid not null references sponsors (id),
  -- 外部システム（広告ネットワークのSSV等）から案件を特定するための短い識別子。
  code text not null unique,
  title text not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'finished')),

  -- 運営が1件の完了ごとに受け取る金額（円）。成果報酬型の案件はここだけ、
  -- 固定額の案件は fixed_fee_yen だけを使う。両方入っていても構わない
  -- （固定＋成果のハイブリッド）。
  revenue_per_completion_yen numeric(12, 2) not null default 0
    check (revenue_per_completion_yen >= 0),
  fixed_fee_yen numeric(12, 2) not null default 0 check (fixed_fee_yen >= 0),

  -- 受注額の上限。ここを超えて作業させると自腹になるので、null（無制限）
  -- は本当に無制限の契約のときだけにする。
  budget_yen numeric(12, 2) check (budget_yen is null or budget_yen >= 0),
  max_completions int check (max_completions is null or max_completions > 0),

  -- 1ptを何円とみなすか。ポイントは換金できない前提なので実際の負債では
  -- ないが、これを決めないと「1件80円もらって120pt配っている」ような
  -- 逆ざやが見えない。原価計算専用の数字。
  point_value_yen numeric(10, 4) not null default 1.0 check (point_value_yen >= 0),

  starts_at timestamptz,
  ends_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_campaigns_status on campaigns (status);

comment on column campaigns.point_value_yen is
  '原価計算用の1ptの円換算。ポイント自体は換金不可で、この値は会計上の負債額ではない。';

-- -------------------------------------------------------------------------
-- campaign_payments: 実際に入金された円
--
-- 発生額（task_completions.revenue_yen の合計）と入金額を別に持つのは、
-- 成果は出たのに請求も入金もされていない案件を見えるようにするため。
-- -------------------------------------------------------------------------
create table if not exists campaign_payments (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id),
  amount_yen numeric(12, 2) not null,
  paid_at timestamptz not null default now(),
  memo text,
  created_at timestamptz not null default now()
);

create index if not exists idx_campaign_payments_campaign on campaign_payments (campaign_id);

-- -------------------------------------------------------------------------
-- tasks の拡張
-- -------------------------------------------------------------------------
alter table tasks add column if not exists campaign_id uuid references campaigns (id);

-- 表示上の分類。task_type は enum で増やしにくいので、細かい種別は
-- こちらの自由記述で持つ（lib/workKinds.ts にラベルがある）。
alter table tasks add column if not exists work_kind text;

alter table tasks add column if not exists verification_mode text not null default 'auto'
  check (verification_mode in (
    'auto',    -- 提出＝完了。広告SSVなど、外部が検証済みのものだけ
    'review',  -- 運営が1件ずつ検収してから支払う
    'quorum',  -- 他のユーザーの相互チェックが規定数集まったら支払う
    'none'     -- 検収なし。内部の販促タスク用
  ));

alter table tasks add column if not exists quorum_size int not null default 3
  check (quorum_size > 0);

-- 相互チェック1件あたりの報酬。チェックも労働なので無償にすると誰もやらず、
-- quorum が永久に埋まらない。案件の受取額から出す想定。
alter table tasks add column if not exists review_reward_points bigint not null default 0
  check (review_reward_points >= 0);

-- 同じユーザーが連続で回すのを防ぐ間隔。max_completions_per_user が
-- 「合計何回」なのに対し、こちらは「何分あけて」。
alter table tasks add column if not exists cooldown_minutes int
  check (cooldown_minutes is null or cooldown_minutes >= 0);

-- 全ユーザー合計の受付上限。案件側の max_completions とは別に、
-- タスク単位で絞りたいとき用。
alter table tasks add column if not exists max_completions_total int
  check (max_completions_total is null or max_completions_total > 0);

-- 案件の単価を上書きしたいとき用（同じ案件の中で難易度の違う作業を
-- 出し分ける場合）。null なら案件の値を使う。
alter table tasks add column if not exists revenue_per_completion_yen numeric(12, 2)
  check (revenue_per_completion_yen is null or revenue_per_completion_yen >= 0);

comment on column tasks.verification_mode is
  '成果物の検収方法。人手の要る作業を auto にすると、そのタスクはポイント製造機になる。';

-- -------------------------------------------------------------------------
-- task_completions の拡張
-- -------------------------------------------------------------------------
alter table task_completions add column if not exists campaign_id uuid references campaigns (id);

-- この1件で運営が受け取る（受け取った）円。作成時点の単価を焼き込むので、
-- あとから案件の単価を変えても過去の実績は動かない。
alter table task_completions add column if not exists revenue_yen numeric(12, 2) not null default 0;

-- ユーザーが提出した成果物そのもの。verification は「本人確認・SSVの生
-- ペイロード」用なので分けている。
alter table task_completions add column if not exists submission jsonb not null default '{}'::jsonb;

alter table task_completions add column if not exists reviewed_by uuid references profiles (id);
alter table task_completions add column if not exists reviewed_at timestamptz;
alter table task_completions add column if not exists review_note text;

-- 支払いが起きた台帳エントリ。完了行から履歴に辿れるようにするためと、
-- complete_task が「今この完了で発生したログ」を確実に返せるようにするため。
alter table task_completions add column if not exists reward_log_id uuid references treasury_logs (id);

create index if not exists idx_task_completions_pending
  on task_completions (task_id) where status = 'pending';

-- -------------------------------------------------------------------------
-- task_peer_reviews: 相互チェック（quorum）の1票
-- -------------------------------------------------------------------------
create table if not exists task_peer_reviews (
  id uuid primary key default gen_random_uuid(),
  completion_id uuid not null references task_completions (id) on delete cascade,
  reviewer_id uuid not null references profiles (id),
  approve boolean not null,
  note text,
  created_at timestamptz not null default now(),
  unique (completion_id, reviewer_id)
);

create index if not exists idx_task_peer_reviews_completion on task_peer_reviews (completion_id);

alter table sponsors enable row level security;
alter table campaigns enable row level security;
alter table campaign_payments enable row level security;
alter table task_peer_reviews enable row level security;

-- =========================================================================
-- apply_task_completion: 保留中（または新規）の完了に実際に支払う
--
-- 支払いの経路が「自動承認」「運営レビュー」「相互チェックの可決」の3つ
-- あるので、残高を動かす処理は必ずここ1か所を通す。
-- =========================================================================
create or replace function public.apply_task_completion(p_completion_id uuid)
returns public.treasury_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_completion task_completions%rowtype;
  v_user_balance bigint;
  v_treasury_balance bigint;
  v_log treasury_logs%rowtype;
begin
  select * into v_completion from task_completions where id = p_completion_id for update;
  if not found then
    raise exception 'completion_not_found';
  end if;
  if v_completion.reward_log_id is not null then
    raise exception 'already_paid';
  end if;

  perform 1 from profiles where id = v_completion.user_id for update;
  if not found then
    raise exception 'user_not_found';
  end if;
  perform 1 from treasury where id = 1 for update;

  update profiles
    set points_balance = points_balance + v_completion.reward_points, updated_at = now()
    where id = v_completion.user_id
    returning points_balance into v_user_balance;

  update treasury
    set balance = balance + v_completion.reward_points, updated_at = now()
    where id = 1
    returning balance into v_treasury_balance;

  insert into treasury_logs (
    entry_type, user_id, points_delta, treasury_delta,
    user_balance_after, treasury_balance_after, ref_table, ref_id, memo
  ) values (
    'task_reward', v_completion.user_id, v_completion.reward_points, v_completion.reward_points,
    v_user_balance, v_treasury_balance, 'tasks', v_completion.task_id, 'task completion reward'
  )
  returning * into v_log;

  update task_completions
    set status = 'verified', verified_at = now(), reward_log_id = v_log.id
    where id = p_completion_id;

  return v_log;
end;
$$;

revoke execute on function public.apply_task_completion(uuid) from anon, authenticated;
grant execute on function public.apply_task_completion(uuid) to service_role;

-- =========================================================================
-- submit_task_work: タスクへの提出を1件受け付ける
--
-- 検収不要なタスクはそのまま支払われ、検収の要るタスクは pending のまま
-- 積まれる。呼び出し側から見ると「提出は必ずこれ」で、支払われたかどうか
-- は返り値の status を見る。
--
-- 上限の判定は pending も数える。保留中を数えないと、承認待ちの間に同じ
-- ユーザーが上限を無視して何十件でも積める。
-- =========================================================================
create or replace function public.submit_task_work(
  p_user_id uuid,
  p_task_id uuid,
  p_idempotency_key text,
  p_submission jsonb default '{}'::jsonb,
  p_verification jsonb default '{}'::jsonb
) returns public.task_completions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task tasks%rowtype;
  v_campaign campaigns%rowtype;
  v_user_count int;
  v_total_count int;
  v_campaign_count int;
  v_campaign_accrued numeric(12, 2);
  v_last_at timestamptz;
  v_revenue numeric(12, 2);
  v_completion task_completions%rowtype;
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
    select count(*) into v_user_count
      from task_completions
      where task_id = p_task_id and user_id = p_user_id and status in ('verified', 'pending');
    if v_user_count >= v_task.max_completions_per_user then
      raise exception 'completion_limit_reached';
    end if;
  end if;

  if v_task.max_completions_total is not null then
    select count(*) into v_total_count
      from task_completions
      where task_id = p_task_id and status in ('verified', 'pending');
    if v_total_count >= v_task.max_completions_total then
      raise exception 'task_quota_exhausted';
    end if;
  end if;

  if v_task.cooldown_minutes is not null and v_task.cooldown_minutes > 0 then
    select max(completed_at) into v_last_at
      from task_completions
      where task_id = p_task_id and user_id = p_user_id and status in ('verified', 'pending');
    if v_last_at is not null and now() < v_last_at + make_interval(mins => v_task.cooldown_minutes) then
      raise exception 'cooldown_active';
    end if;
  end if;

  v_revenue := coalesce(v_task.revenue_per_completion_yen, 0);

  if v_task.campaign_id is not null then
    select * into v_campaign from campaigns where id = v_task.campaign_id for update;
    if not found then
      raise exception 'campaign_not_found';
    end if;
    if v_campaign.status <> 'active' then
      raise exception 'campaign_not_active';
    end if;
    if v_campaign.starts_at is not null and now() < v_campaign.starts_at then
      raise exception 'campaign_not_started';
    end if;
    if v_campaign.ends_at is not null and now() > v_campaign.ends_at then
      raise exception 'campaign_ended';
    end if;

    if v_task.revenue_per_completion_yen is null then
      v_revenue := v_campaign.revenue_per_completion_yen;
    end if;

    if v_campaign.max_completions is not null then
      select count(*) into v_campaign_count
        from task_completions
        where campaign_id = v_campaign.id and status in ('verified', 'pending');
      if v_campaign_count >= v_campaign.max_completions then
        raise exception 'campaign_quota_exhausted';
      end if;
    end if;

    -- 予算超過を「あと1件で超える」時点で止める。作業させてから払えない
    -- と言うのが一番まずいので、判定は受付時に行う。
    if v_campaign.budget_yen is not null then
      select coalesce(sum(revenue_yen), 0) into v_campaign_accrued
        from task_completions
        where campaign_id = v_campaign.id and status in ('verified', 'pending');
      if v_campaign_accrued + v_revenue > v_campaign.budget_yen then
        raise exception 'campaign_budget_exhausted';
      end if;
    end if;
  end if;

  -- どの経路でも一度 pending で入り、支払いは apply_task_completion が
  -- verified に上げる。「検収なし」でも同じ道を通すことで、残高を動かす
  -- コードが1か所に留まる。
  insert into task_completions (
    task_id, user_id, status, reward_points, idempotency_key,
    verification, submission, campaign_id, revenue_yen
  ) values (
    p_task_id, p_user_id, 'pending', v_task.reward_points, p_idempotency_key,
    p_verification, p_submission, v_task.campaign_id, v_revenue
  )
  returning * into v_completion;

  if v_task.verification_mode in ('auto', 'none') then
    perform apply_task_completion(v_completion.id);
    select * into v_completion from task_completions where id = v_completion.id;
  end if;

  return v_completion;
end;
$$;

revoke execute on function public.submit_task_work(uuid, uuid, text, jsonb, jsonb) from anon, authenticated;
grant execute on function public.submit_task_work(uuid, uuid, text, jsonb, jsonb) to service_role;

-- =========================================================================
-- complete_task: 従来どおり「提出したら即支払い」の入口
--
-- 中身は submit_task_work に寄せて、検収の要るタスクに対して呼ばれたら
-- 明示的に断る。広告視聴・アンケートの既存の呼び出しはそのまま動く。
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
  v_completion task_completions%rowtype;
  v_log treasury_logs%rowtype;
begin
  v_completion := submit_task_work(p_user_id, p_task_id, p_idempotency_key, '{}'::jsonb, p_verification);

  if v_completion.reward_log_id is null then
    raise exception 'task_requires_review';
  end if;

  select * into v_log from treasury_logs where id = v_completion.reward_log_id;
  return v_log;
end;
$$;

revoke execute on function public.complete_task(uuid, uuid, text, jsonb) from anon, authenticated;
grant execute on function public.complete_task(uuid, uuid, text, jsonb) to service_role;

-- =========================================================================
-- review_task_completion: 運営による検収
-- =========================================================================
create or replace function public.review_task_completion(
  p_reviewer_id uuid,
  p_completion_id uuid,
  p_approve boolean,
  p_note text default null
) returns public.task_completions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_completion task_completions%rowtype;
begin
  select role into v_role from profiles where id = p_reviewer_id;
  if v_role is null or v_role not in ('admin', 'moderator') then
    raise exception 'not_authorized';
  end if;

  select * into v_completion from task_completions where id = p_completion_id for update;
  if not found then
    raise exception 'completion_not_found';
  end if;
  if v_completion.status <> 'pending' then
    raise exception 'completion_not_pending';
  end if;

  update task_completions
    set reviewed_by = p_reviewer_id, reviewed_at = now(), review_note = p_note
    where id = p_completion_id;

  if p_approve then
    perform apply_task_completion(p_completion_id);
  else
    -- 却下した分は案件の予算を消費しない。差し戻して他の人に回せる。
    update task_completions
      set status = 'rejected', revenue_yen = 0
      where id = p_completion_id;
  end if;

  select * into v_completion from task_completions where id = p_completion_id;
  return v_completion;
end;
$$;

revoke execute on function public.review_task_completion(uuid, uuid, boolean, text) from anon, authenticated;
grant execute on function public.review_task_completion(uuid, uuid, boolean, text) to service_role;

-- =========================================================================
-- peer_review_completion: ユーザー同士の相互チェック（quorum）
--
-- 運営が1件ずつ見るやり方はマイクロワークの件数では破綻するので、既定は
-- こちら。規定数の賛成で支払い、規定数の反対で却下。自分の提出物には
-- 投票できず、1提出につき1人1票。
--
-- チェック自体にも報酬を出す（task.review_reward_points）。無償だと誰も
-- やらず、pending が永久に溜まるだけになる。
-- =========================================================================
create or replace function public.peer_review_completion(
  p_reviewer_id uuid,
  p_completion_id uuid,
  p_approve boolean,
  p_note text default null
) returns public.task_completions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_completion task_completions%rowtype;
  v_task tasks%rowtype;
  v_approvals int;
  v_rejections int;
  v_user_balance bigint;
  v_treasury_balance bigint;
begin
  select * into v_completion from task_completions where id = p_completion_id for update;
  if not found then
    raise exception 'completion_not_found';
  end if;
  if v_completion.status <> 'pending' then
    raise exception 'completion_not_pending';
  end if;
  if v_completion.user_id = p_reviewer_id then
    raise exception 'cannot_review_own_work';
  end if;

  select * into v_task from tasks where id = v_completion.task_id;
  if v_task.verification_mode <> 'quorum' then
    raise exception 'not_peer_reviewed';
  end if;

  if exists (
    select 1 from task_peer_reviews
    where completion_id = p_completion_id and reviewer_id = p_reviewer_id
  ) then
    raise exception 'already_reviewed';
  end if;

  insert into task_peer_reviews (completion_id, reviewer_id, approve, note)
    values (p_completion_id, p_reviewer_id, p_approve, p_note);

  if v_task.review_reward_points > 0 then
    perform 1 from profiles where id = p_reviewer_id for update;
    perform 1 from treasury where id = 1 for update;

    update profiles
      set points_balance = points_balance + v_task.review_reward_points, updated_at = now()
      where id = p_reviewer_id
      returning points_balance into v_user_balance;

    update treasury
      set balance = balance + v_task.review_reward_points, updated_at = now()
      where id = 1
      returning balance into v_treasury_balance;

    insert into treasury_logs (
      entry_type, user_id, points_delta, treasury_delta,
      user_balance_after, treasury_balance_after, ref_table, ref_id, memo
    ) values (
      'peer_review_reward', p_reviewer_id, v_task.review_reward_points, v_task.review_reward_points,
      v_user_balance, v_treasury_balance, 'tasks', v_completion.task_id, 'peer review reward'
    );
  end if;

  select
    count(*) filter (where approve),
    count(*) filter (where not approve)
    into v_approvals, v_rejections
    from task_peer_reviews where completion_id = p_completion_id;

  if v_approvals >= v_task.quorum_size then
    perform apply_task_completion(p_completion_id);
  elsif v_rejections >= v_task.quorum_size then
    update task_completions
      set status = 'rejected', reviewed_at = now(), revenue_yen = 0,
          review_note = coalesce(review_note, '相互チェックで否認されました')
      where id = p_completion_id;
  end if;

  select * into v_completion from task_completions where id = p_completion_id;
  return v_completion;
end;
$$;

revoke execute on function public.peer_review_completion(uuid, uuid, boolean, text) from anon, authenticated;
grant execute on function public.peer_review_completion(uuid, uuid, boolean, text) to service_role;

-- =========================================================================
-- campaign_economics: 案件ごとの採算
--
-- 「受け取った円」と「配ったポイントの原価」を並べる唯一の場所。ここが
-- マイナスの案件は、続けるほど運営が損をする。
--
-- 原価には相互チェックの報酬も入れる。1件の成果物に3人のチェックが付く
-- タスクなら、チェック報酬2ptでも1件あたり6ptの上乗せで、報酬30ptの案件
-- では原価が2割増える。ここを見落とすと、黒字のつもりの案件がずっと赤字
-- で回り続ける。
-- =========================================================================
drop view if exists public.campaign_economics;

create view public.campaign_economics as
select
  c.id,
  c.code,
  c.title,
  c.status,
  s.name as sponsor_name,
  s.kind as sponsor_kind,
  c.budget_yen,
  c.max_completions,
  c.point_value_yen,
  coalesce(v.verified_completions, 0) as verified_completions,
  coalesce(v.pending_completions, 0) as pending_completions,
  c.fixed_fee_yen + coalesce(v.accrued_yen, 0) as accrued_yen,
  coalesce(p.paid_yen, 0) as paid_yen,
  coalesce(v.granted_points, 0) as granted_points,
  coalesce(r.review_points, 0) as review_points,
  round((coalesce(v.granted_points, 0) + coalesce(r.review_points, 0)) * c.point_value_yen, 2)
    as point_cost_yen,
  c.fixed_fee_yen + coalesce(v.accrued_yen, 0)
    - round((coalesce(v.granted_points, 0) + coalesce(r.review_points, 0)) * c.point_value_yen, 2)
    as margin_yen
from campaigns c
join sponsors s on s.id = c.sponsor_id
left join (
  select
    campaign_id,
    count(*) filter (where status = 'verified') as verified_completions,
    count(*) filter (where status = 'pending') as pending_completions,
    coalesce(sum(revenue_yen) filter (where status = 'verified'), 0) as accrued_yen,
    coalesce(sum(reward_points) filter (where status = 'verified'), 0) as granted_points
  from task_completions
  where campaign_id is not null
  group by campaign_id
) v on v.campaign_id = c.id
-- 却下された提出に付いたチェックも数える。否認するのも仕事で、報酬は
-- 実際に支払われている。
left join (
  select tc.campaign_id, sum(t.review_reward_points) as review_points
  from task_peer_reviews pr
  join task_completions tc on tc.id = pr.completion_id
  join tasks t on t.id = tc.task_id
  where tc.campaign_id is not null
  group by tc.campaign_id
) r on r.campaign_id = c.id
left join (
  select campaign_id, sum(amount_yen) as paid_yen
  from campaign_payments
  group by campaign_id
) p on p.campaign_id = c.id;

comment on view public.campaign_economics is
  '案件ごとの発生額・入金額・付与ポイントの原価（相互チェックの報酬を含む）。margin_yen がマイナスなら逆ざや。';
