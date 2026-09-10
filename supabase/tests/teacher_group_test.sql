-- ============================================================================
-- Teaching groups -- adversarial tests
--
-- A teaching group is the first thing in this schema where one person's row is
-- deliberately readable by many others, and where an adult gains standing
-- access to a student's work. So the interesting cases are all the ones where
-- somebody reaches something they were never given:
--
--   * a teacher reading a student who never opted in
--   * a teacher reading the wrong subject's marks for a student who did
--   * a teacher reaching into another teacher's group
--   * a student editing the date of their own test
--   * a student reading the roster, which is a list of their classmates
--   * anyone adding themselves to a group whose id they happened to learn
--
-- Every one of these is attempted as that user and required to fail.
-- ============================================================================
\set QUIET on
set client_min_messages = warning;

create or replace function tg_reset() returns void
language plpgsql security definer set search_path = public, auth as $$
declare y uuid;
begin
  delete from auth.users where email like '%@tg.test';
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000000c1', 'teacher@tg.test'),
    ('00000000-0000-0000-0000-0000000000c2', 'student@tg.test'),
    ('00000000-0000-0000-0000-0000000000c3', 'classmate@tg.test'),
    ('00000000-0000-0000-0000-0000000000c4', 'other-teacher@tg.test'),
    ('00000000-0000-0000-0000-0000000000c5', 'stranger@tg.test');

  update profiles set full_name = 'Test Teacher', role = 'teacher'
   where id = '00000000-0000-0000-0000-0000000000c1';
  update profiles set full_name = 'Test Student'
   where id = '00000000-0000-0000-0000-0000000000c2';
  update profiles set role = 'teacher'
   where id = '00000000-0000-0000-0000-0000000000c4';

  select id into y from school_years where is_current limit 1;

  -- Two classes of the student's own. Only one is ever linked to the group,
  -- which is what makes "sharing Physics does not share History" testable.
  insert into classes (id, owner_id, school_year_id, name) values
    ('00000000-0000-0000-0000-0000000000d1',
     '00000000-0000-0000-0000-0000000000c2', y, 'Physics'),
    ('00000000-0000-0000-0000-0000000000d2',
     '00000000-0000-0000-0000-0000000000c2', y, 'History');

  insert into grades (id, owner_id, class_id, title, score, out_of) values
    ('00000000-0000-0000-0000-0000000000f1',
     '00000000-0000-0000-0000-0000000000c2',
     '00000000-0000-0000-0000-0000000000d1', 'Unit 1 test', 17, 20),
    ('00000000-0000-0000-0000-0000000000f2',
     '00000000-0000-0000-0000-0000000000c2',
     '00000000-0000-0000-0000-0000000000d2', 'Essay', 8, 10);

  insert into teacher_groups (id, owner_id, school_year_id, name) values
    ('00000000-0000-0000-0000-00000000c9a1',
     '00000000-0000-0000-0000-0000000000c1', y, 'Physics 11'),
    ('00000000-0000-0000-0000-00000000c9a2',
     '00000000-0000-0000-0000-0000000000c4', y, 'Somebody else''s class');

  -- A date the teacher published to their group.
  insert into events (id, school_year_id, owner_id, title, is_all_day,
                      start_date, end_date, visibility, status, content_hash,
                      group_id)
  values ('00000000-0000-0000-0000-0000000000e9', y,
          '00000000-0000-0000-0000-0000000000c1',
          'Unit 2 test', true, '2026-11-03', '2026-11-03',
          'private', 'approved', 'unit 2 test::2026-11-03',
          '00000000-0000-0000-0000-00000000c9a1');
end;
$$;

create or replace function tg_as(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
end;
$$;

/**
 * True only for a refusal this schema actually wrote.
 *
 * `when others then ok := true` passes for any error at all, which is how a
 * test proves the wrong thing: the first run of this file "passed" a refusal
 * that was really `column reference "join_code" is ambiguous` -- a bug in the
 * function, reported by the test as the permission boundary working. A test
 * that cannot tell a refusal from a crash is not testing a refusal.
 */
create or replace function refused_properly(message text) returns boolean
language sql immutable as $$
  select message like '%is not yours%'
      or message like '%not valid%'
      or message like '%must be student, parent or teacher%'
      or message like '%permission denied%'
      or message like '%violates row-level security%';
$$;

select tg_reset();
set client_min_messages = notice;

-- (1) Joining ----------------------------------------------------------------
do $$
declare code text; joined text; ok boolean := false;
begin
  perform tg_as('00000000-0000-0000-0000-0000000000c1');
  code := rotate_group_join_code('00000000-0000-0000-0000-00000000c9a1');
  perform expect('a teacher can make a join code', length(code), 8);
  perform expect('the code has no confusable characters', code ~ '^[A-HJ-NP-Z2-9]{8}$', true);

  perform tg_as('00000000-0000-0000-0000-0000000000c2');
  select out_group_name into joined from redeem_group_join_code(code);
  perform expect('a student can join with it', joined, 'Physics 11');

  -- The same code, typed by a second student. A join code is not single-use --
  -- it is how a whole class gets in -- which is exactly why closing it matters.
  perform tg_as('00000000-0000-0000-0000-0000000000c3');
  perform redeem_group_join_code(code);
  perform expect('a class joins on one code',
    (select count(*) from teacher_group_members
      where group_id = '00000000-0000-0000-0000-00000000c9a1' and left_at is null),
    2::bigint);

  -- Closing it keeps everybody in and lets nobody else in.
  perform tg_as('00000000-0000-0000-0000-0000000000c1');
  perform close_group_join_code('00000000-0000-0000-0000-00000000c9a1');

  perform tg_as('00000000-0000-0000-0000-0000000000c5');
  begin
    perform redeem_group_join_code(code);
  exception when others then ok := refused_properly(sqlerrm);
  end;
  perform expect('a closed class refuses a code that used to work', ok, true);
  perform expect('and the members it already had are untouched',
    (select count(*) from teacher_group_members
      where group_id = '00000000-0000-0000-0000-00000000c9a1' and left_at is null),
    2::bigint);
end $$;

-- (2) A stranger cannot rotate or close somebody else's code -----------------
do $$
declare ok boolean := false;
begin
  perform tg_as('00000000-0000-0000-0000-0000000000c4');
  begin
    perform rotate_group_join_code('00000000-0000-0000-0000-00000000c9a1');
  exception when others then ok := refused_properly(sqlerrm);
  end;
  perform expect('another teacher CANNOT rotate this class''s code', ok, true);

  ok := false;
  perform tg_as('00000000-0000-0000-0000-0000000000c2');
  begin
    perform close_group_join_code('00000000-0000-0000-0000-00000000c9a1');
  exception when others then ok := refused_properly(sqlerrm);
  end;
  perform expect('a student in the class CANNOT close it', ok, true);
end $$;

-- (3) Nobody joins a group by knowing its id ---------------------------------
--
-- The insert policy is the whole control here: there isn't one, so the only
-- way in is through the definer function that checks a code.
do $$
declare ok boolean := false;
begin
  perform tg_as('00000000-0000-0000-0000-0000000000c5');
  begin
    execute 'set local role authenticated';
    insert into teacher_group_members (group_id, student_id)
    values ('00000000-0000-0000-0000-00000000c9a1',
            '00000000-0000-0000-0000-0000000000c5');
    execute 'reset role';
  exception when others then
    ok := true;
    execute 'reset role';
  end;
  perform expect('a stranger CANNOT add themselves to a class', ok, true);
end $$;

-- (4) The roster belongs to the teacher --------------------------------------
do $$
begin
  perform expect('the teacher sees both members',
    as_user_count('00000000-0000-0000-0000-0000000000c1',
      'select count(*) from teacher_group_members
        where group_id = ''00000000-0000-0000-0000-00000000c9a1'''),
    2::bigint);

  -- A class list is not something everybody in the class gets a copy of.
  perform expect('a student sees only their own membership',
    as_user_count('00000000-0000-0000-0000-0000000000c2',
      'select count(*) from teacher_group_members
        where group_id = ''00000000-0000-0000-0000-00000000c9a1'''),
    1::bigint);

  perform expect('another teacher sees none of it',
    as_user_count('00000000-0000-0000-0000-0000000000c4',
      'select count(*) from teacher_group_members
        where group_id = ''00000000-0000-0000-0000-00000000c9a1'''),
    0::bigint);

  perform expect('a teacher can read the name of somebody in their class',
    as_user_count('00000000-0000-0000-0000-0000000000c1',
      'select count(*) from profiles
        where id = ''00000000-0000-0000-0000-0000000000c2'''),
    1::bigint);

  perform expect('and cannot read a student who is in nobody''s class',
    as_user_count('00000000-0000-0000-0000-0000000000c1',
      'select count(*) from profiles
        where id = ''00000000-0000-0000-0000-0000000000c5'''),
    0::bigint);
end $$;

-- (5) A published date reaches members and nobody else -----------------------
do $$
declare ok boolean := false; n int;
begin
  perform expect('a member sees the published date',
    as_user_count('00000000-0000-0000-0000-0000000000c2',
      'select count(*) from events
        where id = ''00000000-0000-0000-0000-0000000000e9'''),
    1::bigint);

  perform expect('a stranger does not',
    as_user_count('00000000-0000-0000-0000-0000000000c5',
      'select count(*) from events
        where id = ''00000000-0000-0000-0000-0000000000e9'''),
    0::bigint);

  perform expect('another teacher does not',
    as_user_count('00000000-0000-0000-0000-0000000000c4',
      'select count(*) from events
        where id = ''00000000-0000-0000-0000-0000000000e9'''),
    0::bigint);

  -- Readable is not writable. A student moving the date of their own test is
  -- the obvious abuse of putting the teacher's row in their calendar.
  perform tg_as('00000000-0000-0000-0000-0000000000c2');
  execute 'set local role authenticated';
  update events set start_date = '2026-12-25'
   where id = '00000000-0000-0000-0000-0000000000e9';
  get diagnostics n = row_count;
  execute 'reset role';
  perform expect('a student CANNOT move the date of a test', n, 0);

  perform tg_as('00000000-0000-0000-0000-0000000000c2');
  execute 'set local role authenticated';
  delete from events where id = '00000000-0000-0000-0000-0000000000e9';
  get diagnostics n = row_count;
  execute 'reset role';
  perform expect('a student CANNOT delete it either', n, 0);
end $$;

-- (6) Marks are private until the student says otherwise ---------------------
do $$
begin
  perform expect('a teacher sees no marks by default',
    as_user_count('00000000-0000-0000-0000-0000000000c1',
      'select count(*) from grades
        where owner_id = ''00000000-0000-0000-0000-0000000000c2'''),
    0::bigint);
end $$;

-- The student links the class and turns sharing on -- both, deliberately: a
-- membership with no class linked has nothing to match and must share nothing.
do $$
declare n int;
begin
  perform tg_as('00000000-0000-0000-0000-0000000000c2');
  execute 'set local role authenticated';
  update teacher_group_members set share_progress = true
   where group_id = '00000000-0000-0000-0000-00000000c9a1'
     and student_id = '00000000-0000-0000-0000-0000000000c2';
  get diagnostics n = row_count;
  execute 'reset role';
  perform expect('the student can turn sharing on', n, 1);
end $$;

do $$
begin
  perform expect('sharing with no class linked still shares nothing',
    as_user_count('00000000-0000-0000-0000-0000000000c1',
      'select count(*) from grades
        where owner_id = ''00000000-0000-0000-0000-0000000000c2'''),
    0::bigint);
end $$;

do $$
begin
  perform tg_as('00000000-0000-0000-0000-0000000000c2');
  execute 'set local role authenticated';
  update teacher_group_members set class_id = '00000000-0000-0000-0000-0000000000d1'
   where group_id = '00000000-0000-0000-0000-00000000c9a1'
     and student_id = '00000000-0000-0000-0000-0000000000c2';
  execute 'reset role';

  perform expect('now the teacher sees the linked class''s mark',
    as_user_count('00000000-0000-0000-0000-0000000000c1',
      'select count(*) from grades
        where id = ''00000000-0000-0000-0000-0000000000f1'''),
    1::bigint);

  -- The narrowest and most important one. Sharing Physics is not sharing
  -- everything the student has a mark for.
  perform expect('and CANNOT see a mark from a different class',
    as_user_count('00000000-0000-0000-0000-0000000000c1',
      'select count(*) from grades
        where id = ''00000000-0000-0000-0000-0000000000f2'''),
    0::bigint);

  perform expect('and another teacher sees neither',
    as_user_count('00000000-0000-0000-0000-0000000000c4',
      'select count(*) from grades
        where owner_id = ''00000000-0000-0000-0000-0000000000c2'''),
    0::bigint);
end $$;

-- Turning it back off has to actually revoke, not just hide a button.
do $$
begin
  perform tg_as('00000000-0000-0000-0000-0000000000c2');
  execute 'set local role authenticated';
  update teacher_group_members set share_progress = false
   where group_id = '00000000-0000-0000-0000-00000000c9a1'
     and student_id = '00000000-0000-0000-0000-0000000000c2';
  execute 'reset role';

  perform expect('turning sharing off takes the mark away again',
    as_user_count('00000000-0000-0000-0000-0000000000c1',
      'select count(*) from grades
        where id = ''00000000-0000-0000-0000-0000000000f1'''),
    0::bigint);
end $$;

-- Leaving does the same, without the student having to remember to unshare.
do $$
begin
  perform tg_as('00000000-0000-0000-0000-0000000000c2');
  execute 'set local role authenticated';
  update teacher_group_members set share_progress = true, left_at = now()
   where group_id = '00000000-0000-0000-0000-00000000c9a1'
     and student_id = '00000000-0000-0000-0000-0000000000c2';
  execute 'reset role';

  perform expect('a student who has left shares nothing, sharing flag or not',
    as_user_count('00000000-0000-0000-0000-0000000000c1',
      'select count(*) from grades
        where id = ''00000000-0000-0000-0000-0000000000f1'''),
    0::bigint);

  perform expect('and their published dates go with them',
    as_user_count('00000000-0000-0000-0000-0000000000c2',
      'select count(*) from events
        where id = ''00000000-0000-0000-0000-0000000000e9'''),
    0::bigint);

  -- Put them back for the announcement tests below.
  perform tg_as('00000000-0000-0000-0000-0000000000c2');
  execute 'set local role authenticated';
  update teacher_group_members set left_at = null, share_progress = false
   where group_id = '00000000-0000-0000-0000-00000000c9a1'
     and student_id = '00000000-0000-0000-0000-0000000000c2';
  execute 'reset role';
end $$;

-- (7) Announcements ----------------------------------------------------------
do $$
declare a uuid; ok boolean := false;
begin
  perform tg_as('00000000-0000-0000-0000-0000000000c1');
  a := announce_to_group('00000000-0000-0000-0000-00000000c9a1',
                         'Bring a calculator on Tuesday.', false);
  perform expect('a teacher can post an announcement', a is not null, true);

  perform expect('a member reads it',
    as_user_count('00000000-0000-0000-0000-0000000000c2',
      'select count(*) from group_announcements
        where group_id = ''00000000-0000-0000-0000-00000000c9a1'''),
    1::bigint);

  perform expect('a stranger does not',
    as_user_count('00000000-0000-0000-0000-0000000000c5',
      'select count(*) from group_announcements
        where group_id = ''00000000-0000-0000-0000-00000000c9a1'''),
    0::bigint);

  perform tg_as('00000000-0000-0000-0000-0000000000c4');
  begin
    perform announce_to_group('00000000-0000-0000-0000-00000000c9a1', 'Hello', false);
  exception when others then ok := refused_properly(sqlerrm);
  end;
  perform expect('another teacher CANNOT post to this class', ok, true);

  ok := false;
  perform tg_as('00000000-0000-0000-0000-0000000000c2');
  begin
    perform announce_to_group('00000000-0000-0000-0000-00000000c9a1', 'Class cancelled', false);
  exception when others then ok := refused_properly(sqlerrm);
  end;
  perform expect('a student CANNOT post as the teacher', ok, true);
end $$;

-- Notifying queues one row per member per channel they chose, and never one
-- for somebody who is not in the group.
do $$
declare a uuid; queued bigint;
begin
  perform ensure_notification_defaults('00000000-0000-0000-0000-0000000000c2');
  perform ensure_notification_defaults('00000000-0000-0000-0000-0000000000c3');
  perform ensure_notification_defaults('00000000-0000-0000-0000-0000000000c5');

  perform tg_as('00000000-0000-0000-0000-0000000000c1');
  a := announce_to_group('00000000-0000-0000-0000-00000000c9a1',
                         'Test moved to Thursday.', true);

  select count(*) into queued from notification_queue
   where subject_type = 'announcement' and subject_id = a;
  perform expect('one queued reminder per member', queued, 2::bigint);

  perform expect('and none for anybody outside the class',
    (select count(*) from notification_queue
      where subject_type = 'announcement' and subject_id = a
        and profile_id = '00000000-0000-0000-0000-0000000000c5'),
    0::bigint);

  perform expect('the announcement records that it notified',
    (select notified from group_announcements where id = a), true);
end $$;

-- (8) The role itself --------------------------------------------------------
do $$
declare ok boolean := false;
begin
  perform tg_as('00000000-0000-0000-0000-0000000000c5');
  perform set_my_role('teacher');
  perform expect('anybody may become a teacher',
    (select role::text from profiles where id = '00000000-0000-0000-0000-0000000000c5'),
    'teacher');

  -- The reason set_my_role() exists at all. Adding a third role must not have
  -- added a fourth way to ask for the second.
  begin
    perform set_my_role('admin');
  exception when others then ok := refused_properly(sqlerrm);
  end;
  perform expect('and still nobody may become an admin', ok, true);
  perform expect('the role is unchanged after trying',
    (select role::text from profiles where id = '00000000-0000-0000-0000-0000000000c5'),
    'teacher');
end $$;

select 'teacher_group_test: all assertions passed' as result;
