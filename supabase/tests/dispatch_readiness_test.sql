-- ============================================================================
-- The reminder pipeline is actually wired up
--
-- Two bugs got past the other suites because nothing called schedule_reminders
-- after the quiet-hours migration changed it:
--
--   * it cast subject_type to a type that does not exist, so the function
--     failed the moment it ran -- no reminder was ever queued;
--   * apply_quiet_hours gained a fifth defaulted parameter without the old
--     four-argument version being dropped, which makes a four-argument call
--     ambiguous rather than resolving to the old one.
--
-- Both are runtime-only: plpgsql does not resolve types or overloads inside
-- embedded SQL until the function is called, so `create function` succeeded
-- and the migration looked clean.
-- ============================================================================
\set QUIET on
set client_min_messages = notice;

do $$
declare
  me constant uuid := '00000000-0000-0000-0000-0000000000ea';
  y uuid; cat_exam uuid; ev uuid; n integer;
begin
  delete from auth.users where email = 'dispatch@notif.test';
  insert into auth.users (id, email) values (me, 'dispatch@notif.test');
  update profiles set timezone = 'America/Toronto' where id = me;
  perform ensure_notification_defaults(me);

  -- Exactly one overload, so a call can never be ambiguous.
  select count(*) into n from pg_proc where proname = 'apply_quiet_hours';
  assert n = 1, format('apply_quiet_hours should have one overload, has %s', n);

  -- A new account is on the channel that has a sender behind it. Defaulting to
  -- email meant every reminder was queued for a channel with nothing to send
  -- it, and the dispatcher marked each one failed.
  assert (select channels from notification_preferences where profile_id = me) = '{web_push}',
    'a new account should default to web push';

  select id into y from school_years where is_current limit 1;
  select id into cat_exam from event_categories where slug = 'exam';

  insert into events (school_year_id, owner_id, category_id, title, content_hash,
                      is_all_day, start_date, end_date, visibility, status, source)
  values (y, me, cat_exam, 'Physics midterm', 'dispatch::physics', true,
          current_date + 2, current_date + 2, 'private', 'approved', 'manual')
  returning id into ev;

  update notification_category_prefs
     set enabled = true, offsets_minutes = '{1440}'
   where profile_id = me and category_id = cat_exam;

  -- The whole point: this must not throw, and must produce a row.
  perform schedule_reminders();

  select count(*) into n from notification_queue where profile_id = me and subject_id = ev;
  assert n = 1, format('expected one queued reminder, got %s', n);

  select count(*) into n from notification_queue
   where profile_id = me and subject_id = ev and channel = 'web_push';
  assert n = 1, 'the reminder should be queued on web push';

  -- Running again must add nothing: the queue's unique key is what makes a
  -- duplicate reminder impossible rather than merely unlikely.
  perform schedule_reminders();
  select count(*) into n from notification_queue where profile_id = me and subject_id = ev;
  assert n = 1, format('a second scheduling run duplicated the reminder: %s rows', n);

  -- And quiet hours still apply through the new signature.
  update notification_preferences
     set quiet_start = '22:00', quiet_end = '07:00', quiet_days = '{1,2,3,4,5}'
   where profile_id = me;
  perform schedule_reminders();

  delete from auth.users where email = 'dispatch@notif.test';
  raise notice 'dispatch readiness: all assertions passed';
end $$;
