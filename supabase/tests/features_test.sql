-- ============================================================================
-- Calenda -- behaviour tests for what was added on 2026-09-09
--
-- `rls_test.sql` asks whether the wrong person is refused. This asks whether
-- the right thing happens: does the quota actually stop at the limit, does the
-- timetable refuse a row nothing can place, does the storage rule really key on
-- the path.
--
-- Run against a database with all migrations applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/features_test.sql
--
-- Any failure raises, so a non-zero exit means a real defect.
--
-- These can be run locally without Supabase. Postgres is installed in the dev
-- container; see CLAUDE.md for the thirty-line shim that stands in for
-- auth.users, auth.uid() and the storage schema.
-- ============================================================================

\set QUIET on
set client_min_messages = warning;

create or replace function feat_reset() returns void
language plpgsql security definer set search_path = public, auth as $$
declare y uuid;
begin
  delete from auth.users where email like '%@feat.test';
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000000b1', 'one@feat.test'),
    ('00000000-0000-0000-0000-0000000000b2', 'two@feat.test');

  select id into y from school_years where is_current limit 1;
  insert into classes (id, owner_id, school_year_id, name)
  values ('00000000-0000-0000-0000-0000000000ba',
          '00000000-0000-0000-0000-0000000000b1', y, 'Feature Test Class');
end;
$$;

create or replace function feat_expect(label text, actual anyelement, wanted anyelement)
returns void language plpgsql as $$
begin
  if actual is distinct from wanted then
    raise exception 'FAIL  %  (got %, expected %)', label, actual, wanted;
  end if;
  raise notice 'pass  %', label;
end;
$$;

/** Runs a statement as a user and reports whether it was refused. */
create or replace function feat_refused(uid uuid, q text) returns boolean
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
  execute q;
  execute 'reset role';
  return false;
exception when others then
  begin execute 'reset role'; exception when others then null; end;
  return true;
end;
$$;

select feat_reset();
set client_min_messages = notice;

-- ================================================== the timetable's shape ===
-- The check constraint is the thing standing between a timetable and a row
-- nothing can place on it. Every one of these is a row a careless form could
-- send.

do $$
begin
  perform feat_expect(
    'a meeting REFUSES both a weekday and a cycle day',
    feat_refused('00000000-0000-0000-0000-0000000000b1',
      $q$insert into class_meetings (class_id, owner_id, day_of_week, cycle_day,
                                     starts_at, ends_at)
         values ('00000000-0000-0000-0000-0000000000ba',
                 '00000000-0000-0000-0000-0000000000b1', 1, 3, '09:00', '10:00')$q$),
    true);

  perform feat_expect(
    'a meeting REFUSES neither one',
    feat_refused('00000000-0000-0000-0000-0000000000b1',
      $q$insert into class_meetings (class_id, owner_id, starts_at, ends_at)
         values ('00000000-0000-0000-0000-0000000000ba',
                 '00000000-0000-0000-0000-0000000000b1', '09:00', '10:00')$q$),
    true);

  perform feat_expect(
    'a meeting REFUSES ending before it starts',
    feat_refused('00000000-0000-0000-0000-0000000000b1',
      $q$insert into class_meetings (class_id, owner_id, day_of_week, starts_at, ends_at)
         values ('00000000-0000-0000-0000-0000000000ba',
                 '00000000-0000-0000-0000-0000000000b1', 1, '10:00', '09:00')$q$),
    true);

  perform feat_expect(
    'a meeting ACCEPTS an ordinary weekday slot',
    feat_refused('00000000-0000-0000-0000-0000000000b1',
      $q$insert into class_meetings (class_id, owner_id, day_of_week, starts_at, ends_at)
         values ('00000000-0000-0000-0000-0000000000ba',
                 '00000000-0000-0000-0000-0000000000b1', 1, '08:50', '10:05')$q$),
    false);
end $$;

-- ======================================================= what a mark needs ===

do $$
begin
  perform feat_expect(
    'a mark REFUSES a score with nothing to be out of',
    feat_refused('00000000-0000-0000-0000-0000000000b1',
      $q$insert into grades (owner_id, class_id, title, score)
         values ('00000000-0000-0000-0000-0000000000b1',
                 '00000000-0000-0000-0000-0000000000ba', 'Half a mark', 17)$q$),
    true);

  -- The row this schema exists to allow, and the one an earlier draft of the
  -- constraint would have rejected: a test with a date and no mark yet.
  perform feat_expect(
    'a mark ACCEPTS a dated row that is not marked yet',
    feat_refused('00000000-0000-0000-0000-0000000000b1',
      $q$insert into grades (owner_id, class_id, title, recorded_on)
         values ('00000000-0000-0000-0000-0000000000b1',
                 '00000000-0000-0000-0000-0000000000ba', 'Unit 3 test', current_date)$q$),
    false);

  perform feat_expect(
    'a mark REFUSES being out of zero',
    feat_refused('00000000-0000-0000-0000-0000000000b1',
      $q$insert into grades (owner_id, class_id, title, score, out_of)
         values ('00000000-0000-0000-0000-0000000000b1',
                 '00000000-0000-0000-0000-0000000000ba', 'Divide by nothing', 5, 0)$q$),
    true);
end $$;

-- A mark starts private. This is the feature, so it is asserted rather than
-- assumed from reading the default.
do $$
declare shared boolean;
begin
  select shared_with_parents into shared from grades
   where owner_id = '00000000-0000-0000-0000-0000000000b1' limit 1;
  perform feat_expect('a mark is private the moment it exists', shared, false);
end $$;

-- ========================================================== the chat quota ===
-- The number that stands between one person and everybody's shared free tier.

do $$
declare allowed boolean; i integer; refused_at integer := 0;
begin
  perform set_config('request.jwt.claim.sub',
    '00000000-0000-0000-0000-0000000000b1', true);
  set local role authenticated;

  for i in 1..45 loop
    allowed := claim_chat_message();
    if not allowed and refused_at = 0 then refused_at := i; end if;
  end loop;
  reset role;

  -- Forty, from the constant in 20260909000500. If that number changes, this
  -- fails and the two are reconciled deliberately rather than drifting.
  perform feat_expect('the quota allows exactly 40 in a day', refused_at, 41);
end $$;

do $$
declare allowed boolean;
begin
  -- A second person is unaffected by the first spending theirs. The primary key
  -- is (owner_id, day), and a mistake there would make the limit global.
  perform set_config('request.jwt.claim.sub',
    '00000000-0000-0000-0000-0000000000b2', true);
  set local role authenticated;
  allowed := claim_chat_message();
  reset role;
  perform feat_expect('one person spending their quota does not spend another''s',
                      allowed, true);
end $$;

do $$
declare allowed boolean;
begin
  -- No signed-in caller, no claim. Otherwise an unauthenticated request would
  -- burn the shared allowance without belonging to anybody.
  perform set_config('request.jwt.claim.sub', '', true);
  allowed := claim_chat_message();
  perform feat_expect('the quota refuses a caller with no session', allowed, false);
end $$;

-- ======================================= the admin's allowance is not capped ===
-- Lifting a limit for one person is one line away from lifting it for
-- everybody, so the non-admin case is asserted in the same breath.
do $$
declare allowed boolean; spent integer;
begin
  insert into auth.users (id, email)
    values ('00000000-0000-0000-0000-0000000000d1', 'boss@x.test')
    on conflict do nothing;
  update profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000d1';

  perform set_config('request.jwt.claim.sub',
    '00000000-0000-0000-0000-0000000000d1', true);

  -- Straight past forty. The forty-first is the one a normal account is
  -- refused on, so the loop deliberately runs past it rather than to it.
  for i in 1..45 loop
    select claim_chat_message() into allowed;
  end loop;
  perform feat_expect('an admin is not refused past the daily limit', allowed, true);

  select used into spent from chat_usage
   where owner_id = '00000000-0000-0000-0000-0000000000d1' and day = current_date;
  -- Recorded, not exempted from counting. chat_usage has to stay an honest
  -- account of what was spent against a shared free tier, and the admin is the
  -- person most likely to be spending it.
  perform feat_expect('...and every one of them was still counted', spent, 45);
end $$;

do $$
declare allowed boolean; refused_at integer := 0;
begin
  insert into auth.users (id, email)
    values ('00000000-0000-0000-0000-0000000000d2', 'pupil@x.test')
    on conflict do nothing;
  perform set_config('request.jwt.claim.sub',
    '00000000-0000-0000-0000-0000000000d2', true);

  for i in 1..45 loop
    select claim_chat_message() into allowed;
    if not allowed and refused_at = 0 then refused_at := i; end if;
  end loop;
  perform feat_expect('a student is still refused on the forty-first', refused_at, 41);
end $$;

-- ================================================== set_my_role, both ways ===
-- It had never worked. The trigger meant to be its belt was blocking it, and
-- only a student -- who changes nothing -- got through. See 20260909000700.

do $$
declare became text;
begin
  perform set_config('request.jwt.claim.sub',
    '00000000-0000-0000-0000-0000000000b2', true);
  set local role authenticated;
  perform set_my_role('parent');
  reset role;
  select role::text into became from profiles
   where id = '00000000-0000-0000-0000-0000000000b2';
  perform feat_expect('a user CAN become a parent', became, 'parent');
end $$;

do $$
declare still text;
begin
  perform feat_expect(
    'set_my_role still REFUSES admin',
    feat_refused('00000000-0000-0000-0000-0000000000b2',
                 $q$select set_my_role('admin')$q$),
    true);
  select role::text into still from profiles
   where id = '00000000-0000-0000-0000-0000000000b2';
  perform feat_expect('...and the role is untouched', still, 'parent');
end $$;

do $$
declare still text;
begin
  -- The flag set_my_role uses is transaction-local and cleared straight after
  -- its own update, so it cannot be borrowed for a second statement. And even
  -- if it could, the column grant refuses `role` before any trigger runs --
  -- which is what this actually demonstrates.
  perform feat_expect(
    'setting the flag by hand does NOT let a client write the role column',
    feat_refused('00000000-0000-0000-0000-0000000000b2',
      $q$select set_config('calenda.role_via_function', 'on', true);
         update profiles set role = 'admin'
          where id = '00000000-0000-0000-0000-0000000000b2'$q$),
    true);
  select role::text into still from profiles
   where id = '00000000-0000-0000-0000-0000000000b2';
  perform feat_expect('...and the role is still untouched', still, 'parent');
end $$;

-- ====================================================== storage by path ======
-- The whole access rule for attachments is the first folder of the object's
-- name. If that is wrong, every report card in the bucket is readable by
-- everybody who can guess a uuid.

do $$
begin
  perform feat_expect(
    'an object under your own uid is ACCEPTED',
    feat_refused('00000000-0000-0000-0000-0000000000b1',
      $q$insert into storage.objects (bucket_id, name)
         values ('attachments',
                 '00000000-0000-0000-0000-0000000000b1/report-cards/mine.pdf')$q$),
    false);

  perform feat_expect(
    'an object under somebody else''s uid is REFUSED',
    feat_refused('00000000-0000-0000-0000-0000000000b1',
      $q$insert into storage.objects (bucket_id, name)
         values ('attachments',
                 '00000000-0000-0000-0000-0000000000b2/report-cards/theirs.pdf')$q$),
    true);

  perform feat_expect(
    'an object at the bucket root is REFUSED',
    feat_refused('00000000-0000-0000-0000-0000000000b1',
      $q$insert into storage.objects (bucket_id, name)
         values ('attachments', 'loose.pdf')$q$),
    true);
end $$;

do $$
declare seen bigint;
begin
  perform set_config('request.jwt.claim.sub',
    '00000000-0000-0000-0000-0000000000b2', true);
  set local role authenticated;
  select count(*) into seen from storage.objects
   where bucket_id = 'attachments'
     and name like '00000000-0000-0000-0000-0000000000b1/%';
  reset role;
  perform feat_expect('another user CANNOT list your attachments', seen, 0::bigint);
end $$;

do $$
declare is_public boolean;
begin
  -- A public bucket serves objects without consulting a policy at all, so this
  -- being true would make every rule above decorative.
  select public into is_public from storage.buckets where id = 'attachments';
  perform feat_expect('the attachments bucket is NOT public', is_public, false);
end $$;

select feat_reset();
