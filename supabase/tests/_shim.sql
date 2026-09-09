-- ============================================================================
-- The parts of a Supabase project the schema assumes exist.
--
-- Enough to APPLY every migration and run the test files against a plain
-- Postgres. Not a Supabase replica and not trying to be: no PostgREST, no GoTrue,
-- no realtime. What it provides is the handful of things the SQL actually
-- references -- the three roles, `auth.users`, `auth.uid()`, and enough of the
-- storage schema for the attachment policies to be exercised.
--
-- WHY THIS FILE EXISTS
--
-- Every migration in this repo shipped unrun for its first five days, on the
-- reasoning that Supabase is unreachable from the dev container. That is true
-- and it was never a reason to ship SQL unverified: Postgres runs perfectly
-- well *in* the container. The first time it was tried, it found that
-- `set_my_role()` had never worked and every parent who signed up was filed as
-- a student.
--
-- Roles are cluster-wide rather than per-database, so their creation is guarded
-- -- a second database in the same cluster must not fail on them.
-- ============================================================================

do $$
begin
  create role anon nologin noinherit;
exception when duplicate_object then null;
end $$;

do $$
begin
  create role authenticated nologin noinherit;
exception when duplicate_object then null;
end $$;

do $$
begin
  create role service_role nologin noinherit bypassrls;
exception when duplicate_object then null;
end $$;

grant usage on schema public to anon, authenticated, service_role;

-- Supabase sets these on a real project, and several tables rely on them
-- rather than carrying explicit grants.
alter default privileges in schema public
  grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to postgres, anon, authenticated, service_role;

create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists supabase_migrations;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

-- Reads the same setting the real one does, which is the setting every test
-- sets to impersonate somebody.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  'authenticated')
$$;

create or replace function auth.email() returns text
language sql stable as $$
  select email from auth.users where id = auth.uid()
$$;

grant usage on schema auth to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets,
  name       text,
  owner      uuid,
  created_at timestamptz not null default now()
);

alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated;

-- The real one returns the folder path WITHOUT the trailing filename, which is
-- the whole reason `(storage.foldername(name))[1]` is the owner's uid rather
-- than something one element further along.
create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;

-- ---------------------------------------------------------------------------
-- The two helpers every test file uses and only one of them defines.
--
-- `rls_test.sql` creates both; `notification_test.sql` and
-- `parent_invite_test.sql` call them and create neither. So those two
-- have never been runnable on their own -- they pass only when run after
-- rls_test in the same session, which also means they inherit its fixtures and
-- fail on colliding ids. Defining it here makes each file independent, which is
-- what scripts/db-test.sh relies on.
--
-- `create or replace`, so a test file that defines its own still wins.
-- ---------------------------------------------------------------------------
create or replace function expect(label text, actual anyelement, wanted anyelement)
returns void language plpgsql as $$
begin
  if actual is distinct from wanted then
    raise exception 'FAIL  %  (got %, expected %)', label, actual, wanted;
  end if;
  raise notice 'pass  %', label;
end;
$$;

/** Runs a query as a given user and returns the row count it can see. */
create or replace function as_user_count(uid uuid, q text) returns bigint
language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
  execute q into n;
  execute 'reset role';
  return n;
end;
$$;
