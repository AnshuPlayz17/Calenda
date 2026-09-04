-- ============================================================================
-- Calenda -- adversarial RLS tests
--
-- These do not check that the app works. They check that people who should
-- NOT be able to reach data cannot reach it, by attempting the access as
-- that user and requiring it to fail.
--
-- Run against a database with all migrations applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql
--
-- Any failure raises, so a non-zero exit means a real hole.
-- ============================================================================

\set QUIET on
set client_min_messages = warning;

-- ---------------------------------------------------------------- fixtures --

create or replace function tests_reset() returns void
language plpgsql security definer set search_path = public, auth as $$
declare
  y uuid;
begin
  delete from auth.users where email like '%@rls.test';

  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000000a1', 'student@rls.test'),
    ('00000000-0000-0000-0000-0000000000a2', 'parent@rls.test'),
    ('00000000-0000-0000-0000-0000000000a3', 'admin@rls.test'),
    ('00000000-0000-0000-0000-0000000000a4', 'stranger@rls.test');

  update profiles set role = 'admin'
    where id = '00000000-0000-0000-0000-0000000000a3';

  select id into y from school_years where is_current limit 1;

  -- A private event owned by the student.
  insert into events (id, school_year_id, owner_id, title, is_all_day,
                      start_date, end_date, visibility, status, content_hash)
  values ('00000000-0000-0000-0000-0000000000e1', y,
          '00000000-0000-0000-0000-0000000000a1',
          'Orthodontist', true, '2026-10-20', '2026-10-20',
          'private', 'approved', 'orthodontist::2026-10-20');

  -- An accepted parent link. This alone must grant nothing.
  insert into parent_links (parent_id, student_id, status, accepted_at)
  values ('00000000-0000-0000-0000-0000000000a2',
          '00000000-0000-0000-0000-0000000000a1', 'accepted', now());
end;
$$;

-- Runs a query as a given user and returns the row count it can see.
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

create or replace function expect(label text, actual anyelement, wanted anyelement)
returns void language plpgsql as $$
begin
  if actual is distinct from wanted then
    raise exception 'FAIL  %  (got %, expected %)', label, actual, wanted;
  end if;
  raise notice 'pass  %', label;
end;
$$;

select tests_reset();

-- ================================================================== tests ===
set client_min_messages = notice;

-- (1) A parent link alone grants nothing --------------------------------------
do $$
begin
  perform expect(
    'linked parent CANNOT see an unshared private event',
    as_user_count('00000000-0000-0000-0000-0000000000a2',
      'select count(*) from events where id = ''00000000-0000-0000-0000-0000000000e1'''),
    0::bigint);
end $$;

-- ...and sharing it explicitly is what grants access.
update events set shared_with_parents = true
  where id = '00000000-0000-0000-0000-0000000000e1';

do $$
begin
  perform expect(
    'linked parent CAN see it once explicitly shared',
    as_user_count('00000000-0000-0000-0000-0000000000a2',
      'select count(*) from events where id = ''00000000-0000-0000-0000-0000000000e1'''),
    1::bigint);
end $$;

-- An unrelated user is never in scope, shared or not.
do $$
begin
  perform expect(
    'stranger CANNOT see a shared private event',
    as_user_count('00000000-0000-0000-0000-0000000000a4',
      'select count(*) from events where id = ''00000000-0000-0000-0000-0000000000e1'''),
    0::bigint);
end $$;

-- (2) An admin has no read path to private content ----------------------------
do $$
begin
  perform expect(
    'admin CANNOT see a user''s private event',
    as_user_count('00000000-0000-0000-0000-0000000000a3',
      'select count(*) from events where id = ''00000000-0000-0000-0000-0000000000e1'''),
    0::bigint);
end $$;

-- (3) A user cannot approve their own suggestion ------------------------------
do $$
declare ok boolean := false;
begin
  begin
    perform set_config('request.jwt.claim.sub',
      '00000000-0000-0000-0000-0000000000a1', true);
    set local role authenticated;
    insert into events (school_year_id, owner_id, title, is_all_day, start_date,
                        end_date, visibility, status, content_hash)
    values ((select id from school_years where is_current limit 1),
            '00000000-0000-0000-0000-0000000000a1',
            'Chess Club', true, '2026-11-02', '2026-11-02',
            'community', 'approved', 'chess club::2026-11-02');
  exception when insufficient_privilege or check_violation then
    ok := true;
  end;
  reset role;
  perform expect('user CANNOT self-publish an approved community event', ok, true);
end $$;

-- ...but may suggest one, which lands as pending.
do $$
declare st event_status;
begin
  perform set_config('request.jwt.claim.sub',
    '00000000-0000-0000-0000-0000000000a1', true);
  set local role authenticated;
  insert into events (school_year_id, owner_id, title, is_all_day, start_date,
                      end_date, visibility, status, content_hash)
  values ((select id from school_years where is_current limit 1),
          '00000000-0000-0000-0000-0000000000a1',
          'Chess Club', true, '2026-11-02', '2026-11-02',
          'community', 'pending', 'chess club::2026-11-02')
  returning status into st;
  reset role;
  perform expect('user CAN suggest a community event as pending', st, 'pending'::event_status);
end $$;

-- (4) The role column cannot be self-elevated ---------------------------------
do $$
declare ok boolean := false;
begin
  begin
    perform set_config('request.jwt.claim.sub',
      '00000000-0000-0000-0000-0000000000a1', true);
    set local role authenticated;
    update profiles set role = 'admin'
      where id = '00000000-0000-0000-0000-0000000000a1';
  exception when insufficient_privilege or raise_exception then
    ok := true;
  end;
  reset role;
  perform expect('user CANNOT promote themselves to admin', ok, true);
end $$;

-- (5) Private notebooks are unreachable by URL guessing -----------------------
do $$
declare cls uuid; pg uuid;
begin
  insert into classes (owner_id, school_year_id, name)
  values ('00000000-0000-0000-0000-0000000000a1',
          (select id from school_years where is_current limit 1), 'Computer Science')
  returning id into cls;

  insert into notebook_pages (class_id, owner_id, title)
  values (cls, '00000000-0000-0000-0000-0000000000a1', 'Recursion')
  returning id into pg;

  perform expect(
    'stranger CANNOT read a private notebook page by id',
    as_user_count('00000000-0000-0000-0000-0000000000a4',
      format('select count(*) from notebook_pages where id = %L', pg)),
    0::bigint);

  perform expect(
    'admin CANNOT read a private notebook page by id',
    as_user_count('00000000-0000-0000-0000-0000000000a3',
      format('select count(*) from notebook_pages where id = %L', pg)),
    0::bigint);

  perform expect(
    'owner CAN read their own notebook page',
    as_user_count('00000000-0000-0000-0000-0000000000a1',
      format('select count(*) from notebook_pages where id = %L', pg)),
    1::bigint);
end $$;

-- (6) Google refresh tokens are private, even from an admin -------------------
do $$
begin
  insert into google_accounts (profile_id, google_sub, email, refresh_token)
  values ('00000000-0000-0000-0000-0000000000a1', 'sub-123',
          'student@rls.test', 'secret-refresh-token');

  perform expect(
    'admin CANNOT read another user''s Google refresh token',
    as_user_count('00000000-0000-0000-0000-0000000000a3',
      'select count(*) from google_accounts'),
    0::bigint);
end $$;

select tests_reset();
