#!/usr/bin/env bash
#
# Apply every migration to a real Postgres and run every SQL test file.
#
#   ./scripts/db-test.sh              # starts a throwaway cluster and cleans up
#   DATABASE_URL=postgres://... ./scripts/db-test.sh
#
# WHY THIS EXISTS
#
# Every migration in this repo shipped unrun for its first five days, because
# Supabase is unreachable from the dev container. That was true and it was never
# a reason to ship SQL unverified -- Postgres runs perfectly well *in* the
# container. The first time it was tried, it found that `set_my_role()` had
# never worked and every parent who signed up was silently filed as a student,
# and the test that would have caught it had been sitting in the repo, unrun,
# the whole time.
#
# EACH TEST FILE GETS ITS OWN DATABASE
#
# They are not independent and were never written to be. `parent_invite_test`
# uses an `expect()` that `rls_test` defines, and several of them insert
# fixtures with colliding ids -- so running them in sequence produces failures
# that belong to the previous file rather than the one being blamed. Cloning a
# prepared template per file removes the whole category.
#
# WHAT THIS DOES NOT DO
#
# It does not test against real data, PostgREST, GoTrue or the hosted project.
# `_shim.sql` provides the handful of Supabase objects the SQL references and
# nothing more. A green run here means the schema is correct and the policies
# behave; it does not mean the deployment works.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS="$ROOT/supabase/migrations"
TESTS="$ROOT/supabase/tests"

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
OWN_CLUSTER=0
PGDIR="${PGDIR:-/tmp/calenda-pgtest}"
PORT="${PGPORT:-5433}"

cleanup() {
  if [ "$OWN_CLUSTER" = "1" ]; then
    "$PGBIN/pg_ctl" -D "$PGDIR/data" -m immediate stop >/dev/null 2>&1 || true
    rm -rf "$PGDIR"
  fi
}
trap cleanup EXIT

if [ -n "${DATABASE_URL:-}" ]; then
  echo "Using DATABASE_URL (databases are created and dropped beside it)"
else
  [ -x "$PGBIN/initdb" ] || {
    echo "No Postgres at $PGBIN and no DATABASE_URL set." >&2
    echo "Set PGBIN, or pass DATABASE_URL." >&2
    exit 1
  }

  # initdb refuses to run as root. Run the whole cluster as an unprivileged
  # user when we happen to be root, which is the case in the dev container.
  RUNAS=""
  if [ "$(id -u)" = "0" ]; then
    RUNAS="ubuntu"
    id "$RUNAS" >/dev/null 2>&1 || RUNAS="nobody"
  fi

  rm -rf "$PGDIR"
  mkdir -p "$PGDIR"
  [ -n "$RUNAS" ] && chown -R "$RUNAS" "$PGDIR"

  as() { if [ -n "$RUNAS" ]; then su "$RUNAS" -c "$1"; else bash -c "$1"; fi; }

  as "$PGBIN/initdb -D $PGDIR/data -U postgres --auth=trust" >/dev/null
  # listen_addresses='' means unix socket only: no TCP port to collide with
  # another cluster, another test run, or anything else on the machine.
  as "$PGBIN/pg_ctl -D $PGDIR/data -l $PGDIR/log -o \"-p $PORT -k $PGDIR -c listen_addresses=''\" start" >/dev/null
  OWN_CLUSTER=1
  sleep 1

  BASE="psql -h $PGDIR -p $PORT -U postgres"
fi

# One pair of helpers, whichever way we got here.
#
# The per-database part matters and is easy to get wrong: the whole point of
# this script is that each test file gets its own database, so a DATABASE_URL
# mode that ran everything against the one database it was handed would defeat
# it silently. The URL's last path segment is swapped for the target database.
db_url() {    # db_url <database>
  printf '%s/%s' "${DATABASE_URL%/*}" "$1"
}

run_sql() {   # run_sql <database> <file>
  local db="$1" file="$2"
  if [ -n "${DATABASE_URL:-}" ]; then
    psql "$(db_url "$db")" -v ON_ERROR_STOP=1 -q -f "$file"
  else
    as "$BASE -d $db -v ON_ERROR_STOP=1 -q -f $file"
  fi
}

run_cmd() {   # run_cmd <sql> -- against the maintenance database
  if [ -n "${DATABASE_URL:-}" ]; then
    psql "$DATABASE_URL" -q -c "$1"
  else
    as "$BASE -q -c \"$1\""
  fi
}

echo "==> Building the template"
run_cmd "drop database if exists calenda_tpl" >/dev/null 2>&1 || true
run_cmd "create database calenda_tpl" >/dev/null
run_sql calenda_tpl "$TESTS/_shim.sql" >/dev/null

fails=0
for f in $(ls "$MIGRATIONS"/*.sql | sort); do
  if run_sql calenda_tpl "$f" >/tmp/calenda-mig.log 2>&1; then
    printf '  ok   %s\n' "$(basename "$f")"
  else
    printf '  FAIL %s\n' "$(basename "$f")"
    grep -v NOTICE /tmp/calenda-mig.log | head -3
    fails=$((fails + 1))
  fi
done
[ "$fails" -eq 0 ] || { echo "$fails migration(s) failed"; exit 1; }

echo
echo "==> Tests, each on its own copy of the template"
for f in $(ls "$TESTS"/*.sql | sort); do
  name="$(basename "$f" .sql)"
  # _shim is setup, not a test.
  [ "$name" = "_shim" ] && continue

  run_cmd "drop database if exists calenda_t" >/dev/null 2>&1 || true
  run_cmd "create database calenda_t template calenda_tpl" >/dev/null

  if run_sql calenda_t "$f" >/tmp/calenda-test.log 2>&1; then
    # Not every file prints "pass" markers -- three of them assert purely by
    # raising, so a count of 0 would read as "this file did nothing" when it
    # had in fact checked a dozen things. Say which it is.
    passes="$(grep -cE 'NOTICE:  pass' /tmp/calenda-test.log || true)"
    # Three files assert with plpgsql ASSERT rather than raise, so both forms
    # are counted. ASSERT is only checked while plpgsql.check_asserts is on --
    # it is on by default and this script does not turn it off, but a file
    # asserting entirely that way is one setting away from passing vacuously.
    raises="$(grep -cE 'raise exception|assert ' "$f" || true)"
    if [ "$passes" -gt 0 ]; then
      printf '  ok   %-28s %2s assertions\n' "$name" "$passes"
    else
      printf '  ok   %-28s no pass markers; %s assert/raise checks\n' "$name" "$raises"
    fi
  else
    printf '  FAIL %-28s\n' "$name"
    grep -E 'ERROR|FAIL' /tmp/calenda-test.log | head -3
    fails=$((fails + 1))
  fi
done

echo
if [ "$fails" -eq 0 ]; then
  echo "All migrations applied and all test files passed."
else
  echo "$fails failure(s)."
  exit 1
fi
