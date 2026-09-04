#!/usr/bin/env bash
# Regenerates supabase/setup.sql from the migrations.
set -euo pipefail
cd "$(dirname "$0")/.."
{
cat <<'HDR'
-- ============================================================================
-- Calenda -- complete database setup
--
-- Paste this whole file into the Supabase SQL Editor and run it once.
-- Generated from supabase/migrations/ -- do not edit by hand.
--
-- The whole thing runs inside a single transaction, so it is ALL-OR-NOTHING.
-- If anything fails -- a dropped connection, a platform incident, a partial
-- paste -- nothing is applied and the database is left untouched. Just run it
-- again. There is never a half-built state to clean up.
--
-- It also records each migration in supabase_migrations.schema_migrations, the
-- table the Supabase CLI and GitHub integration use to track what has already
-- been applied. So running this by hand does NOT conflict with the GitHub
-- integration: when it later deploys, it sees these as done and skips them.
--
-- Verified against PostgreSQL 16.
--
-- Afterwards, sign in to Calenda once, then make yourself the admin:
--
--   update profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'you@example.com');
-- ============================================================================

begin;

set local statement_timeout = '120s';

-- Present on hosted Supabase projects; created here so the file also works on
-- a plain PostgreSQL database.
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);

-- Enabled with no policies, so it is default-deny. The schema is not exposed
-- through PostgREST either, but Supabase's SQL editor rightly warns about any
-- table created without RLS, and there is no reason to be the exception.
-- Supabase's own migration tooling writes this as the service role, which
-- bypasses RLS, so nothing is broken by locking it down.
alter table supabase_migrations.schema_migrations enable row level security;
HDR

for f in supabase/migrations/*.sql; do
  base=$(basename "$f" .sql)
  echo ""
  echo "-- ==========================================================================="
  echo "-- $base.sql"
  echo "-- ==========================================================================="
  echo ""
  cat "$f"
done

echo ""
echo "-- ============================================================================"
echo "-- Mark these migrations as applied, so the GitHub integration skips them."
echo "-- ============================================================================"
echo ""
echo "insert into supabase_migrations.schema_migrations (version, name) values"
first=1
for f in supabase/migrations/*.sql; do
  base=$(basename "$f" .sql)
  version="${base%%_*}"
  name="${base#*_}"
  [ $first -eq 1 ] && first=0 || echo ","
  printf "  ('%s', '%s')" "$version" "$name"
done
echo ""
echo "on conflict (version) do nothing;"
echo ""
echo "-- ============================================================================"
echo "-- Nothing above is saved until this commits."
echo "-- ============================================================================"
echo ""
echo "commit;"
} > supabase/setup.sql
echo "regenerated: $(wc -l < supabase/setup.sql) lines"
