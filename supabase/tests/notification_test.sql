-- ============================================================================
-- Reminder scheduling tests
--
-- The spec asks directly: "can reminders accidentally duplicate?" These exist
-- to answer that with evidence rather than assurance.
-- ============================================================================
\set QUIET on
set client_min_messages = warning;

create or replace function notif_reset() returns void
language plpgsql security definer set search_path = public, auth as $$
declare y uuid; cat uuid;
begin
  delete from auth.users where email like '%@notif.test';
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000000c1', 'student@notif.test');

  update profiles set timezone = 'America/Toronto'
   where id = '00000000-0000-0000-0000-0000000000c1';

  perform ensure_notification_defaults('00000000-0000-0000-0000-0000000000c1');

  select id into y from school_years where is_current limit 1;
  select id into cat from event_categories where slug = 'exam';

  delete from events where title = 'Chemistry Exam';
  insert into events (school_year_id, category_id, owner_id, title, is_all_day,
                      start_date, end_date, visibility, status, content_hash)
  values (y, cat, '00000000-0000-0000-0000-0000000000c1', 'Chemistry Exam',
          true, (current_date + 10), (current_date + 10),
          'private', 'approved', 'chemistry exam');

  delete from notification_queue
   where profile_id = '00000000-0000-0000-0000-0000000000c1';
end;
$$;

select notif_reset();
set client_min_messages = notice;

-- (1) The first run queues something --------------------------------------
do $$
declare first_run int;
begin
  first_run := schedule_reminders();
  perform expect('the first run queues reminders', first_run > 0, true);
end $$;

-- (2) Running it again queues NOTHING -------------------------------------
do $$
declare second_run int; third_run int; total bigint;
begin
  second_run := schedule_reminders();
  third_run  := schedule_reminders();

  perform expect('a second run adds nothing', second_run, 0);
  perform expect('a third run adds nothing', third_run, 0);

  select count(*) into total from notification_queue
   where profile_id = '00000000-0000-0000-0000-0000000000c1'
     and subject_type = 'event';
  -- One reminder: one category offset (1440) x one channel (email).
  perform expect('exactly one reminder exists for the event', total, 1::bigint);
end $$;

-- (3) Multiple offsets produce one row each, not duplicates ---------------
do $$
declare total bigint;
begin
  perform notif_reset();
  update notification_category_prefs
     set offsets_minutes = '{10080, 1440, 60}'   -- a week, a day, an hour
   where profile_id = '00000000-0000-0000-0000-0000000000c1';

  perform schedule_reminders();
  perform schedule_reminders();   -- deliberately twice

  select count(*) into total from notification_queue
   where profile_id = '00000000-0000-0000-0000-0000000000c1'
     and subject_type = 'event';
  perform expect('three offsets give exactly three reminders', total, 3::bigint);
end $$;

-- (4) Two channels double the rows, but only once -------------------------
do $$
declare total bigint;
begin
  perform notif_reset();
  update notification_preferences set channels = '{email,web_push}'
   where profile_id = '00000000-0000-0000-0000-0000000000c1';
  update notification_category_prefs set offsets_minutes = '{1440}'
   where profile_id = '00000000-0000-0000-0000-0000000000c1';

  perform schedule_reminders();
  perform schedule_reminders();

  select count(*) into total from notification_queue
   where profile_id = '00000000-0000-0000-0000-0000000000c1'
     and subject_type = 'event';
  perform expect('two channels give two reminders, not four', total, 2::bigint);
end $$;

-- (5) A disabled category queues nothing ----------------------------------
do $$
declare total bigint;
begin
  perform notif_reset();
  update notification_category_prefs set enabled = false
   where profile_id = '00000000-0000-0000-0000-0000000000c1';
  perform schedule_reminders();

  select count(*) into total from notification_queue
   where profile_id = '00000000-0000-0000-0000-0000000000c1';
  perform expect('a muted category queues nothing', total, 0::bigint);
end $$;

-- (6) Past events are never queued ----------------------------------------
do $$
declare total bigint; y uuid; cat uuid;
begin
  perform notif_reset();
  select id into y from school_years where is_current limit 1;
  select id into cat from event_categories where slug = 'exam';

  insert into events (school_year_id, category_id, owner_id, title, is_all_day,
                      start_date, end_date, visibility, status, content_hash)
  values (y, cat, '00000000-0000-0000-0000-0000000000c1', 'Past Exam', true,
          current_date - 5, current_date - 5, 'private', 'approved', 'past exam');

  perform schedule_reminders();
  select count(*) into total from notification_queue q
   join events e on e.id = q.subject_id
   where e.title = 'Past Exam';
  perform expect('a past event queues nothing', total, 0::bigint);
end $$;

-- (7) Claiming is exclusive -----------------------------------------------
do $$
declare first_batch bigint; second_batch bigint;
begin
  perform notif_reset();
  perform schedule_reminders();
  -- Make everything due now.
  update notification_queue set scheduled_for = now() - interval '1 minute'
   where profile_id = '00000000-0000-0000-0000-0000000000c1';

  select count(*) into first_batch from claim_due_reminders(100);
  select count(*) into second_batch from claim_due_reminders(100);

  perform expect('the first dispatcher claims the work', first_batch > 0, true);
  -- The second gets nothing: a row cannot be sent twice.
  perform expect('a second dispatcher claims nothing', second_batch, 0::bigint);
end $$;

-- (8) Quiet hours move a reminder rather than dropping it -----------------
do $$
declare shifted timestamptz;
begin
  -- 3am Toronto, inside a 22:00-07:00 quiet window.
  shifted := apply_quiet_hours(
    '2027-03-10 08:00:00+00'::timestamptz,  -- 03:00 EST
    '22:00', '07:00', 'America/Toronto');
  perform expect('a 3am reminder is moved, not dropped', shifted is not null, true);
  perform expect('it moves to the end of quiet hours',
                 (shifted at time zone 'America/Toronto')::time, '07:00'::time);
end $$;

do $$
declare kept timestamptz;
begin
  -- 2pm is outside quiet hours and must be left exactly alone.
  kept := apply_quiet_hours(
    '2027-03-10 19:00:00+00'::timestamptz,  -- 14:00 EST
    '22:00', '07:00', 'America/Toronto');
  perform expect('a daytime reminder is untouched',
                 kept, '2027-03-10 19:00:00+00'::timestamptz);
end $$;

select notif_reset();
