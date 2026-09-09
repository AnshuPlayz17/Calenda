-- ============================================================================
-- Every new column on `profiles`, in one file, so the column grant is restated
-- exactly once.
--
-- WHY THEY ARE NOT IN THE MIGRATIONS THEY BELONG TO
--
-- `rls.sql` ends with `revoke update on profiles from authenticated` followed
-- by a grant naming specific columns. A column missing from that list does not
-- fail on its own -- Postgres refuses the **whole** update statement, taking
-- the name and the timezone down with it, silently, because nothing checks the
-- result. 20260907000300 records that this is exactly how one previous attempt
-- shipped broken.
--
-- The defence is to restate the whole list every time. The risk in that is
-- restating it three times in one night and dropping a column from one of
-- them. So: one file, one restatement, and the timetable and walkthrough
-- migrations say plainly that their profile column lives here.
-- ============================================================================

-- ------------------------------------------------------- rotating cycles ---

alter table profiles add column if not exists timetable_cycle_length smallint;
alter table profiles add column if not exists timetable_cycle_anchor date;
alter table profiles add column if not exists timetable_cycle_anchor_day smallint;

-- Added separately from the columns so re-running the file does not fail on an
-- existing constraint, which `add column if not exists` would otherwise skip
-- silently along with the column.
do $$
begin
  alter table profiles add constraint profiles_cycle_length_sane
    check (timetable_cycle_length is null
           or timetable_cycle_length between 2 and 20);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table profiles add constraint profiles_cycle_anchor_day_sane
    check (timetable_cycle_anchor_day is null
           or timetable_cycle_anchor_day >= 1);
exception when duplicate_object then null;
end $$;

comment on column profiles.timetable_cycle_length is
  'Days in a rotating timetable cycle (Day 1..Day N), or null for an ordinary '
  'Monday-to-Friday week. Self-declared: there is no school entity to ask.';

-- THE HONEST LIMIT OF THESE TWO COLUMNS
--
-- Knowing the cycle is six days long does not tell you which day today is. It
-- needs an anchor -- "the 3rd of September was Day 1" -- and then today is
-- counted forward from it.
--
-- Counting forward is where this stops being exact. Cycles skip days the
-- school is closed, and a single unexpected snow day puts every subsequent day
-- off by one for the rest of the year. The app counts weekdays, which is right
-- until the first holiday and wrong afterwards.
--
-- So it is not presented as certain. The timetable shows which day it thinks
-- it is and offers "today is actually Day N", which simply re-anchors these
-- two columns to today. Self-correcting in one tap, by the only person who
-- knows the answer. The alternative -- deriving school days from the imported
-- calendar -- sounds better and would be confidently wrong in a new way every
-- time the calendar was incomplete.
comment on column profiles.timetable_cycle_anchor is
  'A date whose cycle day is known, paired with timetable_cycle_anchor_day. '
  'Re-set whenever the student corrects the day, which is how drift from '
  'unexpected closures is fixed.';

-- ---------------------------------------------------------- the walkthrough --

alter table profiles add column if not exists walkthrough_seen_at timestamptz;

comment on column profiles.walkthrough_seen_at is
  'When this person finished (or skipped) the post-signup walkthrough. Null '
  'means they have not been shown it. A timestamp rather than a boolean so it '
  'can also answer "how long after signing up", and so re-showing the tour '
  'after a big change is a matter of comparing dates rather than resetting a '
  'flag nobody can interpret.';

-- ------------------------------------------------------- the column grant ---
--
-- The full list. Not an addition -- `grant` is additive, so a partial list
-- would still work and would read, to the next person, as though the others
-- had been withdrawn.
--
-- `role` is deliberately absent, as it has been since rls.sql. It is the
-- column `is_admin()` reads, and the only way to change it is `set_my_role()`,
-- which refuses 'admin' by name. Do not add it here.

revoke update on profiles from authenticated;
grant  update (
  full_name,
  avatar_url,
  grade,
  school,
  heard_from,
  timezone,
  onboarded_at,
  timetable_cycle_length,
  timetable_cycle_anchor,
  timetable_cycle_anchor_day,
  walkthrough_seen_at
) on profiles to authenticated;
