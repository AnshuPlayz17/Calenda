-- ============================================================================
-- Reminder scheduling
--
-- Fills notification_queue from events and assignments according to each
-- person's preferences. Designed to be run repeatedly -- by cron, by hand,
-- twice at once -- without ever producing a duplicate reminder: the unique
-- constraint on (profile, subject, channel, offset) does the deduplication,
-- and every insert is ON CONFLICT DO NOTHING.
--
-- That is the whole safety property. It means this can be re-run freely and
-- a missed cron tick simply catches up on the next one.
-- ============================================================================

-- Sensible defaults for anyone who has not opened the settings screen, so a
-- new account still gets reminders.
create or replace function ensure_notification_defaults(target uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into notification_preferences (profile_id) values (target)
  on conflict (profile_id) do nothing;

  -- One day before, for every category, unless the user has said otherwise.
  insert into notification_category_prefs (profile_id, category_id, enabled, offsets_minutes)
  select target, c.id, true, '{1440}'
  from event_categories c
  on conflict (profile_id, category_id) do nothing;
end;
$$;

/**
 * Shifts a reminder out of quiet hours rather than dropping it.
 *
 * A reminder silently discarded because it landed at 2am is worse than one
 * that arrives a little later, so this moves it to the end of the quiet
 * window instead. Handles a window that crosses midnight.
 */
create or replace function apply_quiet_hours(
  at timestamptz, quiet_start time, quiet_end time, tz text
) returns timestamptz
language plpgsql immutable as $$
declare
  local_time time;
  in_quiet boolean;
begin
  if quiet_start is null or quiet_end is null then
    return at;
  end if;

  local_time := (at at time zone tz)::time;

  if quiet_start < quiet_end then
    in_quiet := local_time >= quiet_start and local_time < quiet_end;
  else
    -- e.g. 22:00 -> 07:00 spans midnight.
    in_quiet := local_time >= quiet_start or local_time < quiet_end;
  end if;

  if not in_quiet then
    return at;
  end if;

  -- Move to quiet_end on whichever local day that next occurs.
  return ((at at time zone tz)::date
          + (case when local_time < quiet_end then 0 else 1 end)
          + quiet_end) at time zone tz;
end;
$$;

/**
 * Queues reminders for everything due in the next `horizon`.
 *
 * Returns the number of rows actually inserted, which is 0 on a re-run --
 * a useful signal that the idempotency is working.
 */
create or replace function schedule_reminders(horizon interval default interval '30 days')
returns integer
language plpgsql security definer set search_path = public as $$
declare
  inserted integer := 0;
  n integer;
begin
  -- Events: the owner's own, plus approved community events in the same year.
  with candidates as (
    select
      p.profile_id,
      e.id            as subject_id,
      'event'::text   as subject_type,
      -- An all-day event is treated as starting at 9am local, so "1 day
      -- before" is a useful morning reminder rather than a midnight one.
      case when e.is_all_day
           then ((e.start_date + time '09:00') at time zone pr.timezone)
           else e.start_at
      end             as occurs_at,
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
      np.quiet_start, np.quiet_end, pr.timezone)
  from candidates c
  cross join lateral unnest(c.offsets_minutes) as off
  cross join lateral unnest(c.channels) as ch
  join notification_preferences np on np.profile_id = c.profile_id
  join profiles pr on pr.id = c.profile_id
  -- Never queue something already in the past; it would send immediately.
  where c.occurs_at - (off * interval '1 minute') > now()
  on conflict do nothing;

  get diagnostics n = row_count;
  inserted := inserted + n;

  -- Assignments use the Assignment category's preferences.
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
      np.quiet_start, np.quiet_end, pr.timezone)
  from candidates c
  cross join lateral unnest(c.offsets_minutes) as off
  cross join lateral unnest(c.channels) as ch
  join notification_preferences np on np.profile_id = c.profile_id
  join profiles pr on pr.id = c.profile_id
  where c.occurs_at - (off * interval '1 minute') > now()
  on conflict do nothing;

  get diagnostics n = row_count;
  return inserted + n;
end;
$$;

/**
 * Claims due reminders for sending.
 *
 * Marked 'sent' as they are claimed rather than after delivery, because two
 * dispatchers running at once must not both pick up the same row -- a
 * duplicate reminder is worse than a lost one, and the delivery log records
 * what actually went out.
 */
create or replace function claim_due_reminders(batch integer default 100)
returns setof notification_queue
language plpgsql security definer set search_path = public as $$
begin
  return query
  update notification_queue q
     set state = 'sent', sent_at = now(), attempts = q.attempts + 1
   where q.id in (
     select id from notification_queue
      where state = 'pending' and scheduled_for <= now()
      order by scheduled_for
      limit batch
      for update skip locked
   )
  returning q.*;
end;
$$;

-- Only the service role dispatches; no client ever calls these.
revoke all on function schedule_reminders(interval) from public;
revoke all on function claim_due_reminders(integer) from public;
revoke all on function ensure_notification_defaults(uuid) from public;
grant execute on function ensure_notification_defaults(uuid) to authenticated;
