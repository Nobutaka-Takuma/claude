-- =========================================================================
-- Local development shim
--
-- 0001/0002 are written for a real Supabase project, where `auth.users` and
-- `auth.uid()` are provided by Supabase Auth (GoTrue) automatically. This
-- repo's dev environment runs against a plain local Postgres instead (no
-- Supabase project provisioned), so this file recreates just enough of that
-- surface for 0001's foreign keys and RLS policies to apply unmodified.
--
-- Since 0015 the app keeps credentials in its own `app_users` table, so
-- auth.users here exists only to satisfy 0001's foreign key at the moment
-- it runs; 0015 detaches it again.
--
-- Running this against a real Supabase project would be wrong — there
-- auth.users and auth.uid() belong to GoTrue — so it detects one and does
-- nothing. The same migration list then applies in both places, and nobody
-- has to remember to skip a file.
-- =========================================================================

create extension if not exists "pgcrypto";

do $shim$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    raise notice 'Supabase project detected - skipping the local auth shim.';
    return;
  end if;

  create schema if not exists auth;

  create table if not exists auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique not null,
    encrypted_password text not null,
    created_at timestamptz not null default now()
  );

  -- The app sets this per-connection before running user-scoped queries via
  -- `select set_config('request.jwt.claim.sub', $1, false)`, mirroring the
  -- claim PostgREST injects into `auth.uid()` on a real Supabase project.
  execute $fn$
    create or replace function auth.uid() returns uuid
    language sql stable
    as 'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid'
  $fn$;

  -- Supabase projects come with these roles built in (PostgREST connects as
  -- anon/authenticated, Edge Functions as service_role); 0002's grant/revoke
  -- statements target them by name, so they must exist locally too.
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$shim$;
