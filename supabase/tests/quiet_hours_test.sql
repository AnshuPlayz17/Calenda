-- ============================================================================
-- Quiet hours on chosen days
--
-- Quiet hours used to be a time range and nothing else, so they applied every
-- day or never. These check that choosing days actually narrows the window,
-- and -- the part most likely to be got wrong -- that the day is decided in
-- the reader's own timezone rather than in UTC.
-- ============================================================================
\set QUIET on
set client_min_messages = notice;

do $$
declare
  got      timestamptz;
  expected timestamptz;
  -- 2027-01-15 is a Friday (isodow 5). 2027-01-16 is a Saturday (6).
  friday_night constant timestamptz := '2027-01-15 23:30-05';
  friday_noon  constant timestamptz := '2027-01-15 14:00-05';
begin
  -- No days chosen means every day: unchanged from before the column existed,
  -- so existing rows need no backfill.
  got := apply_quiet_hours(friday_night, '22:00', '07:00', 'America/Toronto', '{}');
  expected := '2027-01-16 07:00-05'::timestamptz;
  assert got = expected,
    format('empty day list should mean every day: got %s, want %s', got, expected);

  -- Friday chosen: held until the window ends.
  got := apply_quiet_hours(friday_night, '22:00', '07:00', 'America/Toronto', '{5}');
  assert got = expected,
    format('friday quiet: got %s, want %s', got, expected);

  -- Only Saturday chosen: a Friday reminder is not quiet and goes out on time.
  got := apply_quiet_hours(friday_night, '22:00', '07:00', 'America/Toronto', '{6}');
  assert got = friday_night,
    format('friday is not saturday: got %s, want %s', got, friday_night);

  -- The whole point of resolving in local time. 23:30 Friday in Toronto is
  -- already 04:30 Saturday in UTC, so a UTC weekday test would call this a
  -- Saturday and let a school-night reminder through.
  got := apply_quiet_hours(friday_night, '22:00', '07:00', 'America/Toronto', '{5}');
  assert got <> friday_night,
    'weekday must be read in the local zone, not UTC';

  got := apply_quiet_hours(friday_night, '22:00', '07:00', 'America/Toronto', '{6}');
  assert got = friday_night,
    'and the same instant must not be treated as Saturday';

  -- Outside the window, the chosen days make no difference.
  got := apply_quiet_hours(friday_noon, '22:00', '07:00', 'America/Toronto', '{1,2,3,4,5}');
  assert got = friday_noon,
    format('daytime is never quiet: got %s', got);

  -- No window set at all: quiet hours are off, whatever the days say.
  got := apply_quiet_hours(friday_night, null, null, 'America/Toronto', '{1,2,3,4,5,6,7}');
  assert got = friday_night, 'a null window is never quiet';

  -- School nights only, weekend free: the same clock time behaves differently
  -- on a Sunday (7, chosen) and a Saturday (6, not).
  got := apply_quiet_hours('2027-01-17 23:30-05'::timestamptz,
                           '22:00', '07:00', 'America/Toronto', '{7,1,2,3,4}');
  assert got = '2027-01-18 07:00-05'::timestamptz,
    format('sunday night held: got %s', got);

  got := apply_quiet_hours('2027-01-16 23:30-05'::timestamptz,
                           '22:00', '07:00', 'America/Toronto', '{7,1,2,3,4}');
  assert got = '2027-01-16 23:30-05'::timestamptz,
    format('saturday night free: got %s', got);

  raise notice 'quiet hours: all assertions passed';
end $$;


-- A weekday outside 1-7 is not a weekday, and must not be storable.
do $$
declare rejected boolean := false;
begin
  delete from auth.users where email = 'quiet@quiet.test';
  insert into auth.users (id, email)
    values ('00000000-0000-0000-0000-0000000000d1', 'quiet@quiet.test');
  -- The profile is created by trigger; its preferences row is not.
  perform ensure_notification_defaults('00000000-0000-0000-0000-0000000000d1');

  begin
    update notification_preferences set quiet_days = '{9}'
     where profile_id = '00000000-0000-0000-0000-0000000000d1';
  exception when check_violation then
    rejected := true;
  end;

  assert rejected, 'weekday 9 should have been rejected by the check constraint';

  -- A real set is accepted.
  update notification_preferences set quiet_days = '{1,2,3,4,5}'
   where profile_id = '00000000-0000-0000-0000-0000000000d1';

  delete from auth.users where email = 'quiet@quiet.test';
  raise notice 'quiet days constraint: all assertions passed';
end $$;
