-- =========================================================================
-- お問い合わせ
--
-- 連絡手段のないサービスは、広告ネットワーク・ASPの審査で落ちる。それ以前
-- に、アカウントが凍結された人・報酬が付かなかった人が運営に届く手段を
-- 持たないのは単純に不当なので、公開の前提として要る。
--
-- ログインしていなくても送れるようにしてある。「ログインできない」が
-- 問い合わせ理由の上位に来るのに、送信にログインが要るのでは意味がない。
-- =========================================================================

create table if not exists contact_messages (
  id uuid primary key default gen_random_uuid(),
  -- ログイン中なら紐づける。未ログインからの送信もあるので null 可。
  user_id uuid references profiles (id),
  name text not null,
  email text not null,
  category text not null check (category in (
    'account',   -- ログイン・アカウントについて
    'points',    -- ポイント・報酬について
    'task',      -- タスク・お仕事について
    'market',    -- マーケット・判定について
    'report',    -- 不適切な内容の報告
    'privacy',   -- 個人情報の開示・訂正・削除
    'business',  -- 広告掲載・提携のご相談
    'other'
  )),
  body text not null,
  status text not null default 'new' check (status in ('new', 'in_progress', 'closed')),
  handled_by uuid references profiles (id),
  handled_at timestamptz,
  handler_note text,
  -- 生のIPは保存しない。連投を止めるのに必要なのは「同じ相手か」だけで、
  -- 誰かを特定できる形で持ち続ける理由がない。
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_contact_messages_status
  on contact_messages (status, created_at desc);
create index if not exists idx_contact_messages_rate
  on contact_messages (ip_hash, created_at desc);

alter table contact_messages enable row level security;

comment on table contact_messages is
  'お問い合わせフォームの受信箱。/admin で処理状況を管理する。';
comment on column contact_messages.ip_hash is
  '連投防止のためのIPのハッシュ。生のIPアドレスは保存しない。';
