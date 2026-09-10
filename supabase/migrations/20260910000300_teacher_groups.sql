-- ============================================================================
-- Teachers, and the classes they teach.
--
-- WHAT A TEACHING GROUP IS, AND WHY IT IS NOT A `class`
--
-- `classes` is a student's own row: their notebook, their marks, their name for
-- the subject. It is theirs and it stays theirs. A teaching group is a
-- different object -- one row that many students join -- and folding the two
-- together would mean either a student's notebook living inside a teacher's
-- record, or a teacher's roster living inside a student's. Neither is a thing
-- anybody asked for.
--
-- A member row may point at the student's own class (`class_id`), which is how
-- "the dates from this group" and "my notes for this subject" end up beside
-- each other without either owning the other.
--
-- HOW A DATE REACHES A STUDENT'S CALENDAR
--
-- A published date is an ordinary row in `events`, owned by the teacher, with
-- `group_id` set. Members read it through a policy. It is deliberately NOT
-- copied into each student's calendar: a copy is correct exactly once, and
-- every edit afterwards has to chase N rows and every one it misses is a
-- student sitting a test on the wrong day.
--
-- The whole app already reads `events` through RLS, so a published date appears
-- in the calendar, the agenda and the .ics export with no client change at all.
-- What the client does need to know is that it may not edit one, which is what
-- `group_id` on the row tells it -- and what the database enforces regardless,
-- since no update or delete policy admits a member.
--
-- WHAT A TEACHER CANNOT SEE
--
-- Everything, by default. Joining a group discloses membership and nothing
-- else. Marks stay private unless the student turns `share_progress` on for
-- that group, one group at a time, and can turn it off again. This is the same
-- stance as `grades.shared_with_parents`, for the same reason: a student whose
-- marks are visible to an adult by default experiences mark tracking as
-- surveillance, and defaulting to visible makes that choice for them.
--
-- A teacher never sees another teacher's group, and a student never sees the
-- other members of theirs -- a roster is the teacher's, not a class list handed
-- to everyone in it.
--
-- ON THE WORDING
--
-- Nothing here says "your school". A group is a thing an individual teacher
-- makes and students choose to join with a code; it is not connected to any
-- school's systems and must never be described as though it were. The app's
-- disclaimer stands everywhere and the teacher screens say this in as many
-- words.
--
-- Safe to apply twice.
-- ============================================================================

-- ------------------------------------------------------------- the role ----

/**
 * `set_my_role()` now accepts 'teacher'.
 *
 * Everything else about it is unchanged and the reasoning in 20260909000700
 * still holds: the control is the COLUMN GRANT in rls.sql, which omits `role`
 * so Postgres refuses any client naming it before a policy or trigger is
 * reached. This function is the one way through, it takes the row id from the
 * token, and it still refuses 'admin' by name.
 */
create or replace function set_my_role(new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'set_my_role: no signed-in user';
  end if;

  if new_role is null or new_role not in ('student', 'parent', 'teacher') then
    raise exception 'set_my_role: role must be student, parent or teacher, got %', new_role;
  end if;

  perform set_config('calenda.role_via_function', 'on', true);

  update profiles
     set role = new_role::user_role
   where id = auth.uid();

  perform set_config('calenda.role_via_function', '', true);
end;
$$;

revoke all on function set_my_role(text) from public;
grant execute on function set_my_role(text) to authenticated;

-- ------------------------------------------------------------- the group ---

create table if not exists teacher_groups (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references profiles on delete cascade,
  school_year_id uuid not null references school_years,
  name           text not null check (length(trim(name)) > 0),
  subject        text,
  room           text,
  color_token    text,

  -- Null means closed: an existing member stays, nobody new can join. Rotating
  -- the code is how a teacher shuts the door on a code that got passed around,
  -- without removing anybody.
  join_code      text unique,

  is_archived    boolean not null default false,
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (owner_id, school_year_id, name)
);

drop trigger if exists teacher_groups_touch on teacher_groups;
create trigger teacher_groups_touch before update on teacher_groups
  for each row execute function set_updated_at();

create index if not exists teacher_groups_owner_idx
  on teacher_groups (owner_id, school_year_id) where not is_archived;

create table if not exists teacher_group_members (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references teacher_groups on delete cascade,
  student_id uuid not null references profiles on delete cascade,

  -- The student's own class row, if they have one for this subject. Set by the
  -- student, `set null` on delete: deleting a class must not eject them from
  -- the group.
  class_id   uuid references classes on delete set null,

  -- Off. Always off on join, until the student says otherwise, for this group
  -- only.
  share_progress boolean not null default false,

  joined_at  timestamptz not null default now(),
  -- Leaving is recorded rather than deleted, so a teacher's view of who was in
  -- the group in March is not rewritten by somebody leaving in June.
  left_at    timestamptz,
  unique (group_id, student_id)
);

create index if not exists teacher_group_members_group_idx
  on teacher_group_members (group_id) where left_at is null;
create index if not exists teacher_group_members_student_idx
  on teacher_group_members (student_id) where left_at is null;

create table if not exists group_announcements (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references teacher_groups on delete cascade,
  owner_id   uuid not null references profiles on delete cascade,
  body       text not null check (length(trim(body)) > 0),
  -- Whether reminders were queued for it. Recorded on the row so "sent to
  -- everyone" is a fact about what happened, not a guess from the UI.
  notified   boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists group_announcements_group_idx
  on group_announcements (group_id, created_at desc);

-- A published date is an event, with the group it was published to on it.
alter table events add column if not exists group_id uuid
  references teacher_groups on delete cascade;
create index if not exists events_group_idx on events (group_id, start_date)
  where group_id is not null;

-- --------------------------------------------------------------- helpers ---

/**
 * True when the caller is a current member of this group.
 *
 * A definer function, so a student checking their own membership does not need
 * read access to the whole members table -- which is what a roster is.
 */
create or replace function is_group_member(target_group uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from teacher_group_members
    where group_id = target_group and student_id = auth.uid() and left_at is null
  );
$$;

/** True when the caller owns this group -- that is, teaches it. */
create or replace function owns_group(target_group uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from teacher_groups where id = target_group and owner_id = auth.uid()
  );
$$;

revoke all on function is_group_member(uuid) from public;
revoke all on function owns_group(uuid) from public;
grant execute on function is_group_member(uuid) to authenticated;
grant execute on function owns_group(uuid) to authenticated;

-- ------------------------------------------------------------- policies ----

alter table teacher_groups        enable row level security;
alter table teacher_group_members enable row level security;
alter table group_announcements   enable row level security;

drop policy if exists teacher_groups_own on teacher_groups;
create policy teacher_groups_own on teacher_groups for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- A member reads the group they are in, and only reads it. There is no update
-- or delete arm: a student cannot rename or archive somebody else's class.
drop policy if exists teacher_groups_member_select on teacher_groups;
create policy teacher_groups_member_select on teacher_groups for select
  using (is_group_member(id));

-- The roster is the teacher's.
drop policy if exists group_members_teacher on teacher_group_members;
create policy group_members_teacher on teacher_group_members for all
  using (owns_group(group_id))
  with check (owns_group(group_id));

-- A student sees their own membership and nobody else's -- not the roster, not
-- who else is in the room.
drop policy if exists group_members_own_select on teacher_group_members;
create policy group_members_own_select on teacher_group_members for select
  using (student_id = auth.uid());

-- They may change their own row (link a class, share progress, leave) and may
-- not move it to somebody else. There is no insert arm: joining goes through
-- redeem_group_join_code(), so nobody can add themselves to a group whose id
-- they happened to learn.
drop policy if exists group_members_own_update on teacher_group_members;
create policy group_members_own_update on teacher_group_members for update
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

drop policy if exists group_announcements_teacher on group_announcements;
create policy group_announcements_teacher on group_announcements for all
  using (owns_group(group_id))
  with check (owns_group(group_id) and owner_id = auth.uid());

drop policy if exists group_announcements_member_select on group_announcements;
create policy group_announcements_member_select on group_announcements for select
  using (is_group_member(group_id));

-- A member reads the group's published dates. Additive: policies are OR'd, so
-- everything events_select already allowed is untouched. There is deliberately
-- no update or delete arm -- a student cannot edit the date of a test.
drop policy if exists events_group_member_select on events;
create policy events_group_member_select on events for select
  using (group_id is not null and is_group_member(group_id));

/**
 * A teacher reads a member's marks for the class they linked, and only where
 * that member has turned sharing on for this group.
 *
 * Three conditions, all required, and the narrowest one is `class_id`: sharing
 * progress for a Physics group must not hand over a History mark. A student
 * who has linked no class shares nothing -- there is nothing for this to match.
 */
drop policy if exists grades_group_teacher_select on grades;
create policy grades_group_teacher_select on grades for select
  using (exists (
    select 1
    from teacher_group_members m
    join teacher_groups g on g.id = m.group_id
    where m.student_id = grades.owner_id
      and m.class_id   = grades.class_id
      and m.share_progress
      and m.left_at is null
      and g.owner_id = auth.uid()
  ));

/**
 * A teacher reads the name of somebody in one of their groups.
 *
 * Without this a roster is a list of uuids. It is as narrow as the parent arm
 * beside it: current members of a group this caller owns, nothing wider, and
 * nothing about a student who has left.
 */
drop policy if exists profiles_group_teacher_select on profiles;
create policy profiles_group_teacher_select on profiles for select
  using (exists (
    select 1
    from teacher_group_members m
    join teacher_groups g on g.id = m.group_id
    where m.student_id = profiles.id
      and m.left_at is null
      and g.owner_id = auth.uid()
  ));

-- ------------------------------------------------------------ join codes ---

/**
 * Makes or rotates the code students type to join a group.
 *
 * Eight characters from an alphabet with no 0/O/1/I, the same as
 * `create_parent_invite()`, so a code survives being read down a phone or
 * copied off a whiteboard.
 *
 * Rotating replaces the old code rather than adding a second one: two live
 * codes for one group means the teacher cannot answer "who can still join".
 * Existing members are untouched by a rotation.
 */
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

  -- Ownership first, before anything is generated or written. A definer
  -- function does not consult RLS, so this check IS the permission boundary.
  if not exists (select 1 from teacher_groups where id = target_group and owner_id = auth.uid()) then
    raise exception 'That class is not yours.';
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
 * Closes the group to new members, keeping everyone already in it.
 */
create or replace function close_group_join_code(target_group uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'You need to be signed in.';
  end if;
  if not exists (select 1 from teacher_groups where id = target_group and owner_id = auth.uid()) then
    raise exception 'That class is not yours.';
  end if;
  update teacher_groups set join_code = null where id = target_group;
end;
$$;

/**
 * Joins the caller to the group a code belongs to.
 *
 * A definer function, so a student never needs read access to `teacher_groups`
 * at large -- which would let anyone enumerate every code in the table.
 *
 * Every failure returns the same message. A distinct "that class is closed"
 * would tell a stranger their guess had hit a real group, which turns this into
 * an oracle for guessing codes.
 *
 * Re-joining after leaving reopens the old row rather than making a second one,
 * so `share_progress` is not silently reset by a rejoin -- and the unique
 * constraint that makes a duplicate impossible is doing the work, not a check.
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

  select * into target
  from teacher_groups
  -- Both sides qualified. `join_code` is a column here and was briefly also
  -- the parameter name, which plpgsql resolves as ambiguous at CALL time --
  -- the migration applies cleanly and the function fails the first time
  -- anybody uses it. That is the same shape of trap already recorded in
  -- CLAUDE.md for types and overloads.
  where teacher_groups.join_code is not null
    and teacher_groups.join_code = upper(trim(code_text))
    and not teacher_groups.is_archived
  for update;

  if not found then
    raise exception 'That code is not valid. Ask your teacher for a new one.';
  end if;

  if target.owner_id = auth.uid() then
    raise exception 'That code is not valid. Ask your teacher for a new one.';
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

revoke all on function rotate_group_join_code(uuid) from public;
revoke all on function close_group_join_code(uuid) from public;
revoke all on function redeem_group_join_code(text) from public;
grant execute on function rotate_group_join_code(uuid) to authenticated;
grant execute on function close_group_join_code(uuid) to authenticated;
grant execute on function redeem_group_join_code(text) to authenticated;

-- --------------------------------------------------------- announcements ---

-- The queue's subject_type is a check constraint rather than an enum, so this
-- widens it rather than adding an enum label. Rewritten wholesale because
-- `alter ... add constraint` on a name that already exists fails, and this file
-- must be safe to apply twice.
alter table notification_queue drop constraint if exists notification_queue_subject_type_check;
alter table notification_queue add constraint notification_queue_subject_type_check
  check (subject_type in ('event','assignment','task','digest','announcement'));

/**
 * Posts an announcement to a group, and optionally queues a reminder for every
 * member.
 *
 * A definer function because queuing is a service-role act everywhere else in
 * this schema: `notification_queue` has a select policy and no insert policy,
 * so nothing signed in may write it. Ownership is checked first, before a row
 * exists, because a definer function does not consult RLS and this check is
 * therefore the permission boundary rather than a convenience.
 *
 * `scheduled_for` is now: an announcement is the thing itself arriving, not a
 * warning that something is coming. It is the one subject type with no future
 * date to count back from.
 *
 * The queue's unique key includes offset_minutes, and every announcement has a
 * fresh id, so two announcements cannot collide and one announcement cannot be
 * queued twice.
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

  insert into group_announcements (group_id, owner_id, body, notified)
  values (target_group, auth.uid(), trim(message), coalesce(also_notify, false))
  returning id into new_id;

  if coalesce(also_notify, false) then
    -- One row per member, on the channels that member actually chose. A member
    -- with no preferences row gets nothing and is not invented a default here:
    -- ensure_notification_defaults() is the one place that decides that, and
    -- two places deciding it is how they drift apart.
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

revoke all on function announce_to_group(uuid, text, boolean) from public;
grant execute on function announce_to_group(uuid, text, boolean) to authenticated;

/**
 * The dispatcher runs as the service role and reads the announcement to build
 * the message. It needs the group's name beside the body, and joining across
 * two tables in an Edge Function is two round trips; this is one.
 */
create or replace view announcement_messages with (security_invoker = true) as
  select a.id, a.group_id, a.body, a.created_at,
         g.name as group_name, p.full_name as teacher_name
    from group_announcements a
    join teacher_groups g on g.id = a.group_id
    join profiles p       on p.id = a.owner_id;
