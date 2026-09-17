-- ============================================================================
-- Rate limits on the three functions that had none.
--
-- WHAT WAS ACTUALLY EXPOSED
--
-- `redeem_group_join_code()` is the one that matters. A join code is eight
-- characters from a 31-letter alphabet -- about 8.5e11 combinations, which is
-- far too many to guess one at a time. But it is the ONLY secret protecting a
-- class, every wrong guess costs a signed-in caller nothing, and the function
-- happily answered as fast as it was asked. A determined account could work
-- through a meaningful slice of the space overnight and land in somebody's
-- class, where it would see published dates and announcements.
--
-- `rotate_group_join_code()` and `announce_to_group()` are smaller: both check
-- ownership first, so the worst case is a teacher's own class filled with
-- announcements or its code churned. Still worth bounding, because neither had
-- anything stopping a loop.
--
-- WHY THE COUNTER IS A TABLE AND NOT A COLUMN
--
-- Per caller, per action, per hour. A column on `profiles` would need a GRANT
-- to be written by anything, and `rls.sql` deliberately re-grants a named list
-- -- so this would be either ungrantable or a column a client could reset,
-- which is not a limit. This table has no policies at all: with RLS enabled and
-- nothing granted, a client cannot read or write it, and only these definer
-- functions touch it.
--
-- WHY THE NUMBERS LIVE INSIDE THE FUNCTIONS
--
-- Same reason `claim_chat_message()` takes no arguments: a caller-supplied
-- limit is not a limit. Each ceiling is a constant in the function that
-- enforces it.
--
-- WHAT THIS IS NOT
--
-- It is not the permission boundary. RLS and the ownership checks are, and they
-- were already there. This only stops somebody doing a permitted thing ten
-- thousand times.
--
-- Safe to apply twice.
-- ============================================================================

create table if not exists action_rates (
  profile_id uuid not null references profiles on delete cascade,
  action     text not null,
  -- Truncated to the hour, so the row IS the window and expiry needs no job.
  window_start timestamptz not null,
  count      int not null default 0,
  primary key (profile_id, action, window_start)
);

alter table action_rates enable row level security;

-- Deliberately no policies. RLS on with none means default-deny for every
-- client; the definer functions below bypass it as the table's owner.

create index if not exists action_rates_sweep_idx on action_rates (window_start);

/**
 * Counts one attempt and says whether it was within the ceiling.
 *
 * Counts the attempt BEFORE deciding, so a refused attempt still costs the
 * caller its slot. A limiter that only counts successes is not a limiter
 * against guessing -- every wrong guess would be free, which is the entire
 * attack it exists to slow.
 */
create or replace function claim_action(action_name text, ceiling int)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  used int;
begin
  if auth.uid() is null then
    raise exception 'You need to be signed in.';
  end if;

  insert into action_rates (profile_id, action, window_start, count)
  values (auth.uid(), action_name, date_trunc('hour', now()), 1)
  on conflict (profile_id, action, window_start)
    do update set count = action_rates.count + 1
  returning count into used;

  return used <= ceiling;
end;
$$;

-- FROM public, anon AND authenticated -- all three.
--
-- `revoke ... from public` alone does NOT hide a function on Supabase. The
-- project grants execute on everything in `public` to anon, authenticated and
-- service_role, and those are explicit grants rather than the implicit PUBLIC
-- one, so revoking PUBLIC leaves them untouched. Checked: after
-- `revoke all ... from public`, `has_function_privilege('authenticated', ...)`
-- still answered true, and the proacl still read `authenticated=X/postgres`.
--
-- This pattern is used elsewhere in these migrations and is correct there --
-- `claim_chat_message()` and `set_my_role()` are MEANT to be called by a
-- signed-in client. It is wrong only for helpers like these two, which exist
-- to be called by the definer functions above and by nothing else.
revoke all on function claim_action(text, int) from public, anon, authenticated;

-- Old rows are rubbish after their hour. Called from claim_action's own
-- callers rather than scheduled: a sweep that needs pg_cron is a sweep that
-- silently stops when pg_cron is not configured.
create or replace function sweep_action_rates() returns void
language sql security definer set search_path = public as $$
  delete from action_rates where window_start < now() - interval '2 hours';
$$;

revoke all on function sweep_action_rates() from public, anon, authenticated;

-- ------------------------------------------------------- the three calls ---

/**
 * Joining a class, now bounded.
 *
 * Twenty attempts an hour. A real student types a code their teacher gave
 * them, gets it wrong once or twice, and is never near this. Somebody working
 * through the keyspace gets 480 guesses a day against 8.5e11 combinations,
 * which is no longer a plan.
 *
 * IT RETURNS NO ROWS ON FAILURE RATHER THAN RAISING, AND THAT IS THE WHOLE
 * REASON THE LIMIT WORKS.
 *
 * The first version of this raised on a bad code, exactly as it always had.
 * `raise exception` in plpgsql aborts the statement, and the abort rolls back
 * `claim_action`'s own increment along with it -- so every wrong guess undid
 * its own count, the counter never moved, and the limiter was decoration. A
 * test that counted the rows afterwards is the only reason that is known: it
 * asserted 25 attempts had been recorded and found none.
 *
 * So the failure path returns normally, with zero rows, and the increment
 * survives. `joinGroup` in the client turns an empty result into the sentence
 * a person reads -- the same sentence for every failure, so a wrong code, a
 * closed class, your own class and a spent allowance are indistinguishable.
 * Telling a guesser which one it was is telling them how to guess better.
 */
create or replace function redeem_group_join_code(code_text text)
returns table (out_group_id uuid, out_group_name text, out_teacher_name text)
language plpgsql security definer set search_path = public as $$
declare
  target teacher_groups%rowtype;
begin
  if auth.uid() is null then
    raise exception 'You need to be signed in.';
  end if;

  -- Counted before anything is looked up, and not undone by what follows.
  if not claim_action('join_group', 20) then
    return;
  end if;

  select * into target
  from teacher_groups
  where teacher_groups.join_code is not null
    and teacher_groups.join_code = upper(trim(code_text))
    and not teacher_groups.is_archived
  for update;

  if not found then
    return;
  end if;

  if target.owner_id = auth.uid() then
    return;
  end if;

  insert into teacher_group_members (group_id, student_id)
  values (target.id, auth.uid())
  on conflict (group_id, student_id)
  do update set left_at = null;

  return query
    select target.id, target.name, p.full_name
    from profiles p
    where p.id = target.owner_id;
end;
$$;

/** Thirty an hour. Rotating is a thing done once a term, not in a loop. */
create or replace function rotate_group_join_code(target_group uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  new_code text;
  attempt  int := 0;
begin
  if auth.uid() is null then
    raise exception 'You need to be signed in.';
  end if;

  -- Ownership BEFORE the rate limit, so somebody else's class cannot be used
  -- to burn your allowance.
  if not exists (select 1 from teacher_groups where id = target_group and owner_id = auth.uid()) then
    raise exception 'That class is not yours.';
  end if;

  if not claim_action('rotate_code', 30) then
    raise exception 'You have changed the code several times just now. Try again shortly.';
  end if;

  loop
    attempt := attempt + 1;
    new_code := '';
    for _ in 1..8 loop
      new_code := new_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;

    begin
      update teacher_groups set join_code = new_code where id = target_group;
      return new_code;
    exception when unique_violation then
      if attempt > 8 then raise exception 'Could not create a join code.'; end if;
    end;
  end loop;
end;
$$;

/**
 * Sixty announcements an hour, which is more than any teacher will post and
 * far less than a loop.
 *
 * It matters more than it looks: an announcement with `notify` queues a row per
 * member per channel, so an unbounded loop is an unbounded write into the
 * notification queue and, from there, into somebody's phone.
 */
create or replace function announce_to_group(target_group uuid, message text, also_notify boolean default false)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You need to be signed in.';
  end if;
  if not exists (select 1 from teacher_groups where id = target_group and owner_id = auth.uid()) then
    raise exception 'That class is not yours.';
  end if;
  if message is null or length(trim(message)) = 0 then
    raise exception 'An announcement needs something in it.';
  end if;

  if not claim_action('announce', 60) then
    raise exception 'You have posted a lot just now. Try again shortly.';
  end if;

  perform sweep_action_rates();

  insert into group_announcements (group_id, owner_id, body, notified)
  values (target_group, auth.uid(), trim(message), coalesce(also_notify, false))
  returning id into new_id;

  if coalesce(also_notify, false) then
    insert into notification_queue
      (profile_id, subject_type, subject_id, channel, offset_minutes, scheduled_for)
    select m.student_id, 'announcement', new_id, c, 0, now()
      from teacher_group_members m
      join notification_preferences np on np.profile_id = m.student_id
      cross join lateral unnest(np.channels) as c
     where m.group_id = target_group and m.left_at is null
    on conflict do nothing;
  end if;

  return new_id;
end;
$$;

revoke all on function redeem_group_join_code(text) from public;
revoke all on function rotate_group_join_code(uuid) from public;
revoke all on function announce_to_group(uuid, text, boolean) from public;
grant execute on function redeem_group_join_code(text) to authenticated;
grant execute on function rotate_group_join_code(uuid) to authenticated;
grant execute on function announce_to_group(uuid, text, boolean) to authenticated;
