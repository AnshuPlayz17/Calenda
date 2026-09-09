-- ============================================================================
-- When each class actually meets.
--
-- Classes have carried a name, a course code, a teacher and a room since the
-- first migration, and no time at all. So the app has never been able to say
-- the one sentence a student most wants from it on a Tuesday morning -- "you
-- have Functions in twenty minutes" -- and the dashboard's "today" has only
-- ever meant events and due dates, never the timetable those sit inside.
--
-- WHY A TABLE RATHER THAN COLUMNS ON `classes`
--
-- A class does not meet once. It meets on several days, often at different
-- times, sometimes in different rooms, and on a rotating timetable it meets in
-- a named block rather than at a clock time. Columns on `classes` would model
-- exactly one of those and force every other school into it.
--
-- WHY NOT `event_series`
--
-- A recurring event and a lesson look alike and are not. `event_series` exists
-- to generate rows in `events`, which show up on the calendar, get reminders,
-- and can be shared and reviewed. Generating five events a week per class for
-- a school year is roughly a thousand rows per student that nobody asked for,
-- all of which would then need suppressing on holidays. A timetable is read
-- and projected, not stored one lesson at a time.
--
-- ROTATING TIMETABLES
--
-- Many schools do not run a Monday-to-Friday repeat; they run Day 1 to Day N
-- against a published cycle. That is a real thing this table cannot express,
-- and pretending otherwise by overloading day_of_week would produce a
-- timetable that is quietly wrong for those schools every second week.
-- `cycle_day` is here for it, nullable, and the app only offers it once the
-- student says their school runs a cycle. A row uses one or the other, never
-- both, and the check constraint enforces that rather than trusting the form.
-- ============================================================================

-- WHERE THE CYCLE LENGTH LIVES, AND WHERE IT NEARLY WENT
--
-- The first draft of this file put `cycle_length` on `school_years`. That was
-- wrong twice over, and both ways are worth writing down because they are the
-- same mistake this schema keeps inviting.
--
-- It is admin-write only -- `school_years_write ... using (is_admin())` -- so a
-- student could not have set it at all. And `school_years` is common
-- vocabulary shared by every account: there is one current year for the whole
-- database, which is the same missing-school-entity hole that leaves
-- `community` events visible to everybody. So one student declaring a 6-day
-- cycle would have declared it for every user in the system.
--
-- It is a fact about one person's school, self-declared, exactly like
-- `profiles.school` and `profiles.grade`. It lives on `profiles`, and it is
-- added in 20260909000600 with the other new profile columns -- one file, one
-- restatement of the column grant, because that grant is the single easiest
-- thing in this schema to get wrong.

-- ------------------------------------------------------------- meetings ----

create table if not exists class_meetings (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references classes   on delete cascade,
  -- Denormalised from the class so the common policy check and every index on
  -- this table are answered without a join. The insert policy requires it to
  -- match both you and the class's owner, so it cannot drift.
  owner_id    uuid not null references profiles  on delete cascade,

  -- 0 = Sunday, matching JavaScript's getDay() so no conversion happens
  -- anywhere between the database and the grid the student looks at. Every
  -- off-by-one in a calendar starts as a conversion somebody forgot.
  day_of_week smallint check (day_of_week between 0 and 6),
  -- 1-based, against profiles.timetable_cycle_length. Deliberately not a
  -- foreign key to anything: the cycle is a number, not a table, and a student
  -- who shortens their cycle should get a visible "Day 7 no longer exists"
  -- rather than a silent cascade deleting their Friday.
  cycle_day   smallint check (cycle_day >= 1),

  starts_at   time not null,
  ends_at     time not null,
  -- Overrides the class's own room for this one meeting. Null means "wherever
  -- the class says", which is the common case and must not be copied, or
  -- changing the class's room would leave five stale copies behind.
  room        text,
  -- "Period 3", "Block A", "Double". The school's own word for this slot.
  label       text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Exactly one of the two ways of naming a day. Both, or neither, is a row
  -- nothing can place on a timetable.
  constraint class_meetings_one_day_kind check (
    (day_of_week is not null and cycle_day is null)
    or (day_of_week is null and cycle_day is not null)
  ),
  -- A lesson that ends before it starts is a typo, and it would render as a
  -- negative-height block or vanish entirely. Midnight-crossing lessons do not
  -- exist; this is a school day.
  constraint class_meetings_ends_after_starts check (ends_at > starts_at)
);

comment on table class_meetings is
  'When a class meets. One row per slot per week (or per cycle day). Read and '
  'projected onto dates by the app; deliberately not expanded into events.';

create index if not exists class_meetings_class_idx
  on class_meetings (class_id);
create index if not exists class_meetings_owner_day_idx
  on class_meetings (owner_id, day_of_week, starts_at);
create index if not exists class_meetings_owner_cycle_idx
  on class_meetings (owner_id, cycle_day, starts_at)
  where cycle_day is not null;

drop trigger if exists class_meetings_touch on class_meetings;
create trigger class_meetings_touch before update on class_meetings
  for each row execute function set_updated_at();

-- ------------------------------------------------------------------ rls ----

alter table class_meetings enable row level security;

-- The same shape as every other nested resource, with one difference: a
-- meeting has no `shared_with_parents` of its own. It is part of the class's
-- description rather than its contents, so it follows the class's flag. A
-- parent who can see that you take Functions can see when Functions is; there
-- is nothing further disclosed by the time that is not disclosed by the name.
drop policy if exists class_meetings_select on class_meetings;
create policy class_meetings_select on class_meetings for select using (
  owner_id = auth.uid()
  or exists (
    select 1 from classes c
     where c.id = class_meetings.class_id
       and ((c.shared_with_parents and is_linked_parent_of(c.owner_id))
            or has_share('class', c.id))
  )
);

-- Exactly the shape notebook_pages, assignments and files already use:
-- the row must claim you as its owner AND hang off a class you own. Both
-- halves are needed. Without the first, `owner_id` is a free text field on a
-- row you are allowed to insert; without the second, you can hang a meeting
-- off somebody else's class and claim it as your own.
--
-- An earlier draft of this file set owner_id from the class in a BEFORE
-- trigger instead. It worked, and it was a second way of doing something the
-- schema already had one way of doing -- and the definer function it needed
-- would answer "no such class" differently for a class that does not exist
-- and one you cannot see, which is a question this app does not answer
-- anywhere else.
drop policy if exists class_meetings_insert on class_meetings;
create policy class_meetings_insert on class_meetings for insert
  with check (owner_id = auth.uid() and class_owner(class_id) = auth.uid());

drop policy if exists class_meetings_update on class_meetings;
create policy class_meetings_update on class_meetings for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and class_owner(class_id) = auth.uid());

drop policy if exists class_meetings_delete on class_meetings;
create policy class_meetings_delete on class_meetings for delete
  using (owner_id = auth.uid());

-- Supabase's default privileges already grant this to `authenticated` for new
-- tables in `public`, so this line is belt to that pair of braces. It is
-- stated because a table whose grants depend on a default set up elsewhere is
-- a table that fails confusingly if that default ever changes -- and because
-- RLS without a grant is a policy nobody can reach.
grant select, insert, update, delete on class_meetings to authenticated;
