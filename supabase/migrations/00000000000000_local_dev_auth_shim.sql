-- =========================================================================
-- Local development shim
--
-- 0001/0002 are written for a real Supabase project, where `auth.users` and
-- `auth.uid()` are provided by Supabase Auth (GoTrue) automatically. This
-- repo's dev environment runs against a plain local Postgres instead (no
-- Supabase project provisioned), so this file recreates just enough of that
-- surface for 0001's foreign keys and RLS policies to apply unmodified.
--
-- The app's own auth (see app/lib/auth.ts) inserts into auth.users on
-- sign-up and issues a signed session cookie holding that user's id — the
-- same role a hosted Supabase project's Auth would play. Do not run this
-- file against a real Supabase project; use its built-in auth.users there.
-- =========================================================================

create extension if not exists "pgcrypto";

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
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- Supabase projects come with these roles built in (PostgREST connects as
-- anon/authenticated, Edge Functions as service_role); 0002's grant/revoke
-- statements target them by name, so they must exist locally too.
do $$
begin
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
$$;

