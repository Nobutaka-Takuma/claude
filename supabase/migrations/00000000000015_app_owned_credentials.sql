-- Stop writing to auth.users.
--
-- Sign-up used to insert (email, encrypted_password) straight into
-- auth.users, which works locally because 0000 creates a two-column stand
-- in for it. On a real Supabase project that table belongs to GoTrue: it
-- has columns we don't fill, is owned by another role, and writing our own
-- bcrypt hashes into it means Supabase Auth and this app disagree about
-- who exists. That's a deployment blocker, not a style problem.
--
-- Credentials move to a table this app owns. auth.users stays untouched,
-- so a Supabase project can later add real Supabase Auth alongside without
-- a collision, and profiles keeps its own id as the user identity that
-- every other table already references.

create extension if not exists "pgcrypto";

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  encrypted_password text not null,
  created_at timestamptz not null default now()
);

-- Credentials are never read by the client — only by server code holding
-- the service connection — so nothing gets a select policy.
alter table app_users enable row level security;

-- Carry over anyone who signed up against the local shim, so an existing
-- database keeps working across this migration.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'auth' and table_name = 'users'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'users' and column_name = 'encrypted_password'
  ) then
    begin
      insert into app_users (id, email, encrypted_password, created_at)
        select u.id, u.email, u.encrypted_password, u.created_at
        from auth.users u
        where exists (select 1 from profiles p where p.id = u.id)
      on conflict (id) do nothing;
    exception when insufficient_privilege then
      -- A real Supabase project: nothing to carry over, and auth.users
      -- isn't ours to read.
      null;
    end;
  end if;
end;
$$;

-- profiles.id pointed at auth.users(id). Repoint it, so a profile can't
-- outlive its credentials and so nothing depends on GoTrue's table.
do $$
declare
  v_constraint text;
begin
  select conname into v_constraint
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'f'
      and confrelid = 'auth.users'::regclass
    limit 1;

  if v_constraint is not null then
    execute format('alter table profiles drop constraint %I', v_constraint);
  end if;
exception when undefined_table then
  -- auth.users doesn't exist at all; nothing to detach from.
  null;
end;
$$;

alter table profiles
  drop constraint if exists profiles_id_app_users_fkey;
alter table profiles
  add constraint profiles_id_app_users_fkey
  foreign key (id) references app_users(id) on delete cascade;
