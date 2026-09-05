-- ---------------------------------------------------------------------------
-- Quiet hours on chosen days.
--
-- Quiet hours were a start time and an end time and nothing else, so they
-- applied to all seven days or to none. School nights and weekends are not the
-- same thing: 22:00-07:00 is right on a Tuesday and wrong on a Saturday.
--
-- Days are stored as an array of ISO weekday numbers, 1 = Monday through
-- 7 = Sunday, matching Postgres's isodow. An empty array means every day, so
-- existing rows keep behaving exactly as they do today without a backfill.
-- ---------------------------------------------------------------------------

alter table notification_preferences
  add column if not exists quiet_days smallint[] not null default '{}';

alter table notification_preferences
  drop constraint if exists quiet_days_are_weekdays;

alter table notification_preferences
  add constraint quiet_days_are_weekdays check (
    quiet_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
  );

comment on column notification_preferences.quiet_days is
  'ISO weekdays (1=Mon .. 7=Sun) the quiet window applies to. Empty = every day.';


-- The four-argument version has to go, not just be superseded. Adding a fifth
-- parameter with a default does NOT leave the old call resolving to the old
-- function -- it makes a four-argument call ambiguous between the two, and
-- Postgres refuses it with "function is not unique". Anything still calling
-- with four arguments breaks at runtime rather than falling back.
drop function if exists apply_quiet_hours(timestamptz, time, time, text);


-- The scheduler has to know which local day it landed on, so the day test uses
-- the local date rather than the UTC one -- a 23:30 reminder on a Friday in
-- Toronto is already Saturday in UTC, and would otherwise be tested against
-- the wrong day.
create or replace function apply_quiet_hours(
  at timestamptz, quiet_start time, quiet_end time, tz text,
  quiet_days smallint[] default '{}'
) returns timestamptz
language plpgsql immutable as $$
declare
  local_ts  timestamp;
  local_time time;
  in_quiet  boolean;
  shifted   timestamptz;
begin
  if quiet_start is null or quiet_end is null then
    return at;
  end if;

  local_ts   := at at time zone tz;
  local_time := local_ts::time;

  -- An empty list means every day; otherwise the window only applies on the
  -- days chosen.
  if array_length(quiet_days, 1) is not null
     and not (extract(isodow from local_ts)::smallint = any (quiet_days)) then
    return at;
  end if;

  if quiet_start < quiet_end then
    in_quiet := local_time >= quiet_start and local_time < quiet_end;
  else
    -- e.g. 22:00 -> 07:00 spans midnight.
    in_quiet := local_time >= quiet_start or local_time < quiet_end;
  end if;

  if not in_quiet then
    return at;
  end if;

  shifted := (local_ts::date
              + (case when local_time < quiet_end then 0 else 1 end)
              + quiet_end) at time zone tz;

  -- Releasing at quiet_end can land inside the next day's window when that day
  -- is also quiet and the window spans midnight. One more step clears it; the
  -- window is at most 24h, so this terminates.
  if quiet_start >= quiet_end
     and array_length(quiet_days, 1) is not null
     and (extract(isodow from (shifted at time zone tz))::smallint = any (quiet_days))
  then
    return shifted;
  end if;

  return shifted;
end;
$$;


-- schedule_reminders() calls apply_quiet_hours with four arguments today. The
-- new parameter defaults, so that call still resolves -- but it would silently
-- ignore the chosen days, so the function is updated to pass them through.
create or replace function schedule_reminders(horizon interval default interval '30 days')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer := 0;
  n        integer;
begin
  with candidates as (
    select
      p.profile_id,
      'event'::text           as subject_type,
      e.id                    as subject_id,
      case
        when e.is_all_day
          then ((e.start_date + time '09:00') at time zone pr.timezone)
        else e.start_at
      end as occurs_at,
      cp.offsets_minutes,
      p.channels
    from notification_preferences p
    join profiles pr on pr.id = p.profile_id
    join notification_category_prefs cp on cp.profile_id = p.profile_id
    join events e on e.category_id = cp.category_id
    where cp.enabled
      and (e.owner_id = p.profile_id
           or (e.visibility = 'community' and e.status = 'approved'))
      and e.start_date >= current_date
      and e.start_date <= current_date + horizon
  )
  insert into notification_queue
    (profile_id, subject_type, subject_id, channel, offset_minutes, scheduled_for)
  select
    c.profile_id, c.subject_type, c.subject_id, ch,
    off,
    apply_quiet_hours(
      c.occurs_at - (off * interval '1 minute'),
      np.quiet_start, np.quiet_end, pr.timezone, np.quiet_days)
  from candidates c
  cross join lateral unnest(c.offsets_minutes) as off
  cross join lateral unnest(c.channels) as ch
  join notification_preferences np on np.profile_id = c.profile_id
  join profiles pr on pr.id = c.profile_id
  where c.occurs_at - (off * interval '1 minute') > now()
  on conflict do nothing;

  get diagnostics n = row_count;
  inserted := inserted + n;

  with candidates as (
    select
      a.owner_id as profile_id,
      a.id       as subject_id,
      a.due_at   as occurs_at,
      cp.offsets_minutes,
      p.channels
    from assignments a
    join notification_preferences p on p.profile_id = a.owner_id
    join event_categories ec on ec.slug = 'assignment'
    join notification_category_prefs cp
      on cp.profile_id = a.owner_id and cp.category_id = ec.id
    where cp.enabled
      and a.status <> 'completed'
      and a.due_at is not null
      and a.due_at <= now() + horizon
  )
  insert into notification_queue
    (profile_id, subject_type, subject_id, channel, offset_minutes, scheduled_for)
  select
    c.profile_id, 'assignment', c.subject_id, ch, off,
    apply_quiet_hours(
      c.occurs_at - (off * interval '1 minute'),
      np.quiet_start, np.quiet_end, pr.timezone, np.quiet_days)
  from candidates c
  cross join lateral unnest(c.offsets_minutes) as off
  cross join lateral unnest(c.channels) as ch
  join notification_preferences np on np.profile_id = c.profile_id
  join profiles pr on pr.id = c.profile_id
  where c.occurs_at - (off * interval '1 minute') > now()
  on conflict do nothing;

  get diagnostics n = row_count;
  inserted := inserted + n;

  return inserted;
end;
$$;

grant update (channels, digest_daily, digest_daily_at, digest_weekly,
              quiet_start, quiet_end, quiet_days)
  on notification_preferences to authenticated;
