-- ============================================================================
-- The reminders list must say what each reminder is about.
--
-- It said "Reminder" for every row on the live site for the life of the
-- feature, because `notification_queue` has no title and preview invented one.
-- So this checks the two things that were wrong and one that must not become
-- wrong: that a title is resolved, that it is resolved per subject type, and
-- that the view does not hand somebody a title they could not otherwise read.
-- ============================================================================
\set QUIET on
set client_min_messages = warning;

create or replace function rt_reset() returns void
language plpgsql security definer set search_path = public, auth as $$
declare y uuid;
begin
  delete from auth.users where email like '%@rt.test';
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000000e1', 'owner@rt.test'),
    ('00000000-0000-0000-0000-0000000000e2', 'teacher@rt.test'),
    ('00000000-0000-0000-0000-0000000000e3', 'stranger@rt.test');
  update profiles set role = 'teacher'
   where id = '00000000-0000-0000-0000-0000000000e2';

  select id into y from school_years where is_current limit 1;

  insert into classes (id, owner_id, school_year_id, name)
  values ('00000000-0000-0000-0000-0000000000c7',
          '00000000-0000-0000-0000-0000000000e1', y, 'Chemistry');

  insert into events (id, school_year_id, owner_id, title, is_all_day,
                      start_date, end_date, visibility, status, content_hash)
  values ('00000000-0000-0000-0000-0000000000b7', y,
          '00000000-0000-0000-0000-0000000000e1',
          'Midterm', true, '2026-11-20', '2026-11-20',
          'private', 'approved', 'midterm::2026-11-20');

  insert into assignments (id, class_id, owner_id, title)
  values ('00000000-0000-0000-0000-0000000000b8',
          '00000000-0000-0000-0000-0000000000c7',
          '00000000-0000-0000-0000-0000000000e1', 'Lab report');

  insert into tasks (id, owner_id, title)
  values ('00000000-0000-0000-0000-0000000000b9',
          '00000000-0000-0000-0000-0000000000e1', 'Buy a lab coat');

  insert into teacher_groups (id, owner_id, school_year_id, name)
  values ('00000000-0000-0000-0000-00000000ca11',
          '00000000-0000-0000-0000-0000000000e2', y, 'Chemistry 11');
  insert into teacher_group_members (group_id, student_id)
  values ('00000000-0000-0000-0000-00000000ca11',
          '00000000-0000-0000-0000-0000000000e1');
  insert into group_announcements (id, group_id, owner_id, body)
  values ('00000000-0000-0000-0000-0000000000ba',
          '00000000-0000-0000-0000-00000000ca11',
          '00000000-0000-0000-0000-0000000000e2', 'Goggles on Thursday.');

  insert into notification_queue
    (profile_id, subject_type, subject_id, channel, offset_minutes, scheduled_for)
  values
    ('00000000-0000-0000-0000-0000000000e1', 'event',
     '00000000-0000-0000-0000-0000000000b7', 'web_push', 1440, now()),
    ('00000000-0000-0000-0000-0000000000e1', 'assignment',
     '00000000-0000-0000-0000-0000000000b8', 'web_push', 1440, now()),
    ('00000000-0000-0000-0000-0000000000e1', 'task',
     '00000000-0000-0000-0000-0000000000b9', 'web_push', 1440, now()),
    ('00000000-0000-0000-0000-0000000000e1', 'announcement',
     '00000000-0000-0000-0000-0000000000ba', 'web_push', 0, now()),
    ('00000000-0000-0000-0000-0000000000e1', 'digest',
     '00000000-0000-0000-0000-0000000000b7', 'email', 0, now());
end;
$$;

create or replace function rt_title(uid uuid, kind text) returns text
language plpgsql as $$
declare t text;
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
  execute format(
    'select subject_title from queued_reminders where profile_id = %L and subject_type = %L',
    uid, kind) into t;
  execute 'reset role';
  return t;
end;
$$;

select rt_reset();
set client_min_messages = notice;

-- (1) Every type resolves to the thing it is about --------------------------
do $$
begin
  perform expect('an event reminder says the event',
    rt_title('00000000-0000-0000-0000-0000000000e1', 'event'), 'Midterm');
  perform expect('an assignment reminder says the assignment',
    rt_title('00000000-0000-0000-0000-0000000000e1', 'assignment'), 'Lab report');
  perform expect('a task reminder says the task',
    rt_title('00000000-0000-0000-0000-0000000000e1', 'task'), 'Buy a lab coat');
  -- The class, not the words: a lock screen should say which class before it
  -- says the message, which is what the dispatcher puts on the push too.
  perform expect('an announcement says which class it came from',
    rt_title('00000000-0000-0000-0000-0000000000e1', 'announcement'), 'Chemistry 11');
  -- A digest is not about one thing, so it has no title and the screen's own
  -- "Reminder" fallback is the right answer there.
  perform expect('a digest has no title, and that is correct',
    rt_title('00000000-0000-0000-0000-0000000000e1', 'digest'), null::text);
end $$;

-- (2) The view is not a way around a policy ---------------------------------
--
-- security_invoker means it runs as the caller. Without that it would run as
-- its owner and hand every title to anybody who could read the queue.
do $$
begin
  perform expect('a stranger sees no rows at all',
    as_user_count('00000000-0000-0000-0000-0000000000e3',
      'select count(*) from queued_reminders'),
    0::bigint);

  perform expect('the owner sees their own five',
    as_user_count('00000000-0000-0000-0000-0000000000e1',
      'select count(*) from queued_reminders'),
    5::bigint);
end $$;

-- (3) A title is resolved on read, never copied ------------------------------
--
-- The whole reason this is a view. Renaming the event has to rename what the
-- reminder says, or the list drifts from the calendar the moment anybody edits
-- anything.
do $$
begin
  update events set title = 'Midterm (moved)'
   where id = '00000000-0000-0000-0000-0000000000b7';

  perform expect('renaming the event renames its reminder',
    rt_title('00000000-0000-0000-0000-0000000000e1', 'event'), 'Midterm (moved)');
end $$;

select 'reminder_title_test: all assertions passed' as result;
