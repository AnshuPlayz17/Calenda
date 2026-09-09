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

-- (7) The role column is not writable by a client at all ---------------------
--
-- This is the real control, and it is a column grant rather than a policy:
--
--   revoke update on profiles from authenticated;
--   grant  update (full_name, avatar_url, grade, timezone, onboarded_at) ...
--
-- Postgres checks column privileges before row-level security, so an update
-- naming `role` is refused before any policy runs. Tested by attempting it and
-- requiring the error, because a redundant policy added later could otherwise
-- make it look guarded when the grant is what is doing the work.
do $$
declare denied boolean := false;
begin
  begin
    perform set_config('request.jwt.claim.sub',
      '00000000-0000-0000-0000-0000000000a1', true);
    set local role authenticated;
    update profiles set role = 'admin'
      where id = '00000000-0000-0000-0000-0000000000a1';
  exception when insufficient_privilege then
    denied := true;
  end;
  reset role;

  perform expect('a client CANNOT name the role column in an update', denied, true);
end $$;

do $$
declare escalated text;
begin
  select role::text into escalated from profiles
    where id = '00000000-0000-0000-0000-0000000000a1';
  perform expect('...so a student is still a student', escalated, 'student');
end $$;

-- (8) set_my_role is the only way through, and it refuses admin ---------------
do $$
declare declared text;
begin
  perform set_config('request.jwt.claim.sub',
    '00000000-0000-0000-0000-0000000000a4', true);
  set local role authenticated;
  perform set_my_role('parent');
  reset role;

  select role::text into declared from profiles
    where id = '00000000-0000-0000-0000-0000000000a4';
  perform expect('a user CAN declare themselves a parent', declared, 'parent');
end $$;

do $$
declare refused boolean := false; still text;
begin
  begin
    perform set_config('request.jwt.claim.sub',
      '00000000-0000-0000-0000-0000000000a4', true);
    set local role authenticated;
    perform set_my_role('admin');
  exception when others then
    refused := true;
  end;
  reset role;

  select role::text into still from profiles
    where id = '00000000-0000-0000-0000-0000000000a4';

  perform expect('set_my_role REFUSES admin', refused, true);
  perform expect('...and the role is unchanged', still, 'parent');
end $$;

-- It edits the caller's row and no other, because the id comes from the token
-- rather than from an argument. There is no shape of call that reaches a4 as
-- a1, but the property is worth pinning: a future signature taking an id would
-- break this test rather than shipping quietly.
do $$
declare victim text;
begin
  perform set_config('request.jwt.claim.sub',
    '00000000-0000-0000-0000-0000000000a1', true);
  set local role authenticated;
  perform set_my_role('student');
  reset role;

  select role::text into victim from profiles
    where id = '00000000-0000-0000-0000-0000000000a4';
  perform expect('set_my_role CANNOT touch another row', victim, 'parent');
end $$;

-- (9) The fields that are granted still work ----------------------------------
-- The guard must not go so far that a person cannot fix their own name, which
-- is the whole point of the settings page.
do $$
declare named text; zone text;
begin
  perform set_config('request.jwt.claim.sub',
    '00000000-0000-0000-0000-0000000000a1', true);
  set local role authenticated;
  update profiles set full_name = 'Sam Student', timezone = 'Europe/London'
    where id = '00000000-0000-0000-0000-0000000000a1';
  reset role;

  select full_name, timezone into named, zone from profiles
    where id = '00000000-0000-0000-0000-0000000000a1';
  perform expect('a user CAN set their own name', named, 'Sam Student');
  perform expect('a user CAN set their own timezone', zone, 'Europe/London');
end $$;

-- ============================================================================
-- Tests for what was added on 2026-09-09: timetable, grades, report cards,
-- chat. Same rule as everything above -- attempt the access as the wrong
-- person and require it to fail.
-- ============================================================================

-- Fixtures for this block. A class owned by the student, so the nested rows
-- have something legitimate to hang off.
do $$
declare y uuid;
begin
  select id into y from school_years where is_current limit 1;

  insert into classes (id, owner_id, school_year_id, name, course_code)
  values ('00000000-0000-0000-0000-0000000000c1',
          '00000000-0000-0000-0000-0000000000a1', y, 'Functions', 'MCR3U');

  -- Shared with parents, so the tests below prove that seeing the CLASS does
  -- not carry seeing the marks or the report card inside it.
  update classes set shared_with_parents = true
    where id = '00000000-0000-0000-0000-0000000000c1';

  insert into grades (id, owner_id, class_id, title, score, out_of)
  values ('00000000-0000-0000-0000-0000000000d1',
          '00000000-0000-0000-0000-0000000000a1',
          '00000000-0000-0000-0000-0000000000c1', 'Unit 3 test', 17, 20);

  insert into report_cards (id, owner_id, storage_path, original_name)
  values ('00000000-0000-0000-0000-0000000000f1',
          '00000000-0000-0000-0000-0000000000a1',
          '00000000-0000-0000-0000-0000000000a1/report-cards/x.pdf',
          'term1.pdf');

  insert into report_card_lines (id, report_card_id, owner_id, course_name, mark, out_of)
  values ('00000000-0000-0000-0000-0000000000f2',
          '00000000-0000-0000-0000-0000000000f1',
          '00000000-0000-0000-0000-0000000000a1', 'Functions', 82, 100);
end $$;

-- (10) A mark is private even when its class is shared ------------------------
-- The default on grades.shared_with_parents is the feature, so it is the thing
-- most worth a test: a parent who can see the class must not see the marks in
-- it until the student says so, one row at a time.
do $$
begin
  perform expect(
    'linked parent CAN see the shared class',
    as_user_count('00000000-0000-0000-0000-0000000000a2',
      'select count(*) from classes where id = ''00000000-0000-0000-0000-0000000000c1'''),
    1::bigint);

  perform expect(
    'linked parent CANNOT see a mark inside that shared class',
    as_user_count('00000000-0000-0000-0000-0000000000a2',
      'select count(*) from grades where id = ''00000000-0000-0000-0000-0000000000d1'''),
    0::bigint);
end $$;

update grades set shared_with_parents = true
  where id = '00000000-0000-0000-0000-0000000000d1';

do $$
begin
  perform expect(
    'linked parent CAN see a mark once explicitly shared',
    as_user_count('00000000-0000-0000-0000-0000000000a2',
      'select count(*) from grades where id = ''00000000-0000-0000-0000-0000000000d1'''),
    1::bigint);

  perform expect(
    'stranger CANNOT see a shared mark',
    as_user_count('00000000-0000-0000-0000-0000000000a4',
      'select count(*) from grades where id = ''00000000-0000-0000-0000-0000000000d1'''),
    0::bigint);

  perform expect(
    'admin CANNOT see a shared mark',
    as_user_count('00000000-0000-0000-0000-0000000000a3',
      'select count(*) from grades where id = ''00000000-0000-0000-0000-0000000000d1'''),
    0::bigint);
end $$;

-- (11) Sharing a mark does not expose the document it came from ---------------
-- A report card carries every other mark, the school, and a teacher's written
-- comment about the person. The grade above is shared at this point in the
-- file, which is exactly when this must still be zero.
do $$
begin
  perform expect(
    'linked parent CANNOT see a report card',
    as_user_count('00000000-0000-0000-0000-0000000000a2',
      'select count(*) from report_cards where id = ''00000000-0000-0000-0000-0000000000f1'''),
    0::bigint);

  perform expect(
    'linked parent CANNOT see a decoded report card line',
    as_user_count('00000000-0000-0000-0000-0000000000a2',
      'select count(*) from report_card_lines where id = ''00000000-0000-0000-0000-0000000000f2'''),
    0::bigint);

  perform expect(
    'admin CANNOT see a report card',
    as_user_count('00000000-0000-0000-0000-0000000000a3',
      'select count(*) from report_cards where id = ''00000000-0000-0000-0000-0000000000f1'''),
    0::bigint);
end $$;

-- (12) A meeting cannot be hung off somebody else's class ---------------------
-- The insert policy has two halves and this attacks the second: the stranger
-- honestly claims themselves as owner, and points at a class that is not
-- theirs.
do $$
declare ok boolean := false;
begin
  begin
    perform set_config('request.jwt.claim.sub',
      '00000000-0000-0000-0000-0000000000a4', true);
    set local role authenticated;
    insert into class_meetings (class_id, owner_id, day_of_week, starts_at, ends_at)
    values ('00000000-0000-0000-0000-0000000000c1',
            '00000000-0000-0000-0000-0000000000a4', 1, '09:00', '10:00');
  exception when insufficient_privilege or check_violation then
    ok := true;
  end;
  reset role;
  perform expect('stranger CANNOT add a meeting to another user''s class', ok, true);
end $$;

-- ...and the other half: claiming the owner's id on a class you cannot touch.
do $$
declare ok boolean := false;
begin
  begin
    perform set_config('request.jwt.claim.sub',
      '00000000-0000-0000-0000-0000000000a4', true);
    set local role authenticated;
    insert into class_meetings (class_id, owner_id, day_of_week, starts_at, ends_at)
    values ('00000000-0000-0000-0000-0000000000c1',
            '00000000-0000-0000-0000-0000000000a1', 1, '09:00', '10:00');
  exception when insufficient_privilege or check_violation then
    ok := true;
  end;
  reset role;
  perform expect('stranger CANNOT insert a meeting owned by someone else', ok, true);
end $$;

-- (13) The chat quota is not advisory ----------------------------------------
-- chat_usage is readable so the UI can say how many are left, and writable by
-- nobody. If a client can update its own row it can set it to zero, and the
-- daily limit protecting a shared free tier stops existing.
do $$
declare ok boolean := false;
begin
  perform set_config('request.jwt.claim.sub',
    '00000000-0000-0000-0000-0000000000a1', true);
  set local role authenticated;
  perform claim_chat_message();
  reset role;

  begin
    perform set_config('request.jwt.claim.sub',
      '00000000-0000-0000-0000-0000000000a1', true);
    set local role authenticated;
    update chat_usage set used = 0
      where owner_id = '00000000-0000-0000-0000-0000000000a1';
  exception when insufficient_privilege then
    ok := true;
  end;
  reset role;
  perform expect('user CANNOT reset their own chat quota', ok, true);
end $$;

do $$
declare seen bigint;
begin
  select as_user_count('00000000-0000-0000-0000-0000000000a4',
    'select count(*) from chat_usage where owner_id = ''00000000-0000-0000-0000-0000000000a1''')
    into seen;
  perform expect('stranger CANNOT read another user''s chat usage', seen, 0::bigint);
end $$;

-- (13b) A conversation is private, and so is every line of it ----------------
-- chat_usage was covered and the conversation itself was not, which is the
-- half that contains what was actually said. Worth asserting directly rather
-- than inferring from chat_messages_all, because that policy has two arms --
-- owner_id AND a thread the writer owns -- and reading it is not the same as
-- running it.
--
-- It also pins the arm the Edge Function had to be taught: a message may not
-- be filed into somebody else's thread. calenda-chat bypassed this with the
-- service role until 2026-09-09 and is now checked separately in
-- src/test/edgeFunctions.test.ts; this is the rule it was bypassing.
do $$
declare seen bigint; ok boolean := false;
begin
  insert into chat_threads (id, owner_id, title) values
    ('00000000-0000-0000-0000-00000000c001',
     '00000000-0000-0000-0000-0000000000a1', 'Mine');
  insert into chat_messages (thread_id, owner_id, role, content) values
    ('00000000-0000-0000-0000-00000000c001',
     '00000000-0000-0000-0000-0000000000a1', 'user', 'what is due this week');

  select as_user_count('00000000-0000-0000-0000-0000000000a4',
    'select count(*) from chat_threads where id = ''00000000-0000-0000-0000-00000000c001''')
    into seen;
  perform expect('stranger CANNOT see another user''s conversation', seen, 0::bigint);

  select as_user_count('00000000-0000-0000-0000-0000000000a4',
    'select count(*) from chat_messages where thread_id = ''00000000-0000-0000-0000-00000000c001''')
    into seen;
  perform expect('stranger CANNOT read what was said in it', seen, 0::bigint);

  -- The second arm of the policy. Carrying your own owner_id is not enough:
  -- the thread has to be yours too, or anyone with a uuid can write into a
  -- stranger's conversation.
  begin
    perform set_config('request.jwt.claim.sub',
      '00000000-0000-0000-0000-0000000000a4', true);
    set local role authenticated;
    insert into chat_messages (thread_id, owner_id, role, content) values
      ('00000000-0000-0000-0000-00000000c001',
       '00000000-0000-0000-0000-0000000000a4', 'user', 'planted');
  exception when others then
    ok := true;
  end;
  reset role;
  perform expect('stranger CANNOT file a message into another user''s thread', ok, true);

  -- The positive control, and it is not optional. Without it the assertion
  -- above passes on ANY failure -- a foreign key, a typo in a column name, a
  -- missing table -- and reports a policy that is not being reached as a
  -- policy that is working. This is the mistake the six original tests made in
  -- the other direction: they used a privilege as fixture setup and never
  -- attacked the getting of it.
  ok := false;
  begin
    perform set_config('request.jwt.claim.sub',
      '00000000-0000-0000-0000-0000000000a1', true);
    set local role authenticated;
    insert into chat_messages (thread_id, owner_id, role, content) values
      ('00000000-0000-0000-0000-00000000c001',
       '00000000-0000-0000-0000-0000000000a1', 'user', 'and this one lands');
    ok := true;
  exception when others then
    ok := false;
  end;
  reset role;
  perform expect('...while the owner still can, so the refusal is the policy', ok, true);
end $$;

-- (14) The new profile columns are actually writable --------------------------
-- The counterpart to test (9), and the reason it exists. `rls.sql` revokes
-- update on profiles and re-grants a named list; a column missing from that
-- list makes Postgres refuse the WHOLE statement, taking every other field in
-- it down too, silently. This fails loudly if 20260909000600 ever drops one.
do $$
declare len smallint; seen timestamptz; named text;
begin
  perform set_config('request.jwt.claim.sub',
    '00000000-0000-0000-0000-0000000000a1', true);
  set local role authenticated;
  update profiles
     set timetable_cycle_length = 6,
         timetable_cycle_anchor = date '2026-09-03',
         timetable_cycle_anchor_day = 1,
         walkthrough_seen_at = now(),
         -- Deliberately in the same statement as the new columns. If any one of
         -- them is missing from the grant, this name is not written either --
         -- which is precisely the failure that shipped once already.
         full_name = 'Sam Student'
   where id = '00000000-0000-0000-0000-0000000000a1';
  reset role;

  select timetable_cycle_length, walkthrough_seen_at, full_name
    into len, seen, named
    from profiles where id = '00000000-0000-0000-0000-0000000000a1';

  perform expect('a user CAN set their timetable cycle', len, 6::smallint);
  perform expect('a user CAN record finishing the walkthrough', seen is not null, true);
  perform expect('...and the rest of the same statement still landed', named, 'Sam Student');
end $$;

select tests_reset();
