-- ============================================================================
-- Marks.
--
-- Asked for explicitly, with sharing off by default. That default is the whole
-- design and not a preference: a student whose parent is linked can experience
-- mark tracking as surveillance rather than help, and an app that defaults a
-- mark to visible has made that choice on their behalf. Every row starts
-- private and the student turns it on, one row at a time, the same way every
-- other object in this app works.
--
-- WHY A ROW IS NOT A COLUMN ON `assignments`
--
-- Not every mark has an assignment behind it. Tests, participation, a whole
-- term's report line, a mark for something that was never tracked as work --
-- all of those are marks with no assignment to hang on. And an assignment can
-- be marked more than once (a draft, then the final). So `assignment_id` is
-- nullable and the relationship is one-to-many, not one-to-one.
--
-- NUMBERS, NOT GRADES
--
-- `score` and `out_of` are numeric and separate, so 17/20 stays 17/20 rather
-- than becoming 85 and losing what it was out of. Percentages are computed for
-- display and never stored -- a stored percentage is a second copy of the same
-- fact that can disagree with the first.
--
-- `letter` exists alongside them because some report cards give only a letter
-- or a level ("B+", "Level 3", "Merit") and inventing a number for it would be
-- making up data. A row may carry a number, a letter, or both.
--
-- WEIGHTING, AND THE AVERAGE THIS DELIBERATELY DOES NOT COMPUTE
--
-- `weight` is stored because a test is not worth the same as a homework, and
-- an average that ignores that is wrong in the direction that matters. But no
-- overall average is stored anywhere. The app computes it on read and says how
-- it computed it, because a stored average is a number that goes stale
-- silently and a mark a student did not expect is the worst possible thing for
-- this app to be confidently wrong about.
-- ============================================================================

create table if not exists grades (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references profiles on delete cascade,
  class_id     uuid not null references classes  on delete cascade,
  -- Null when the mark is not for a tracked piece of work. `set null` rather
  -- than `cascade`: deleting an assignment must not silently delete the mark
  -- you got for it. The mark keeps its own title and stands on its own.
  assignment_id uuid references assignments on delete set null,

  title        text not null check (length(trim(title)) > 0),
  -- A mark may be a number, a letter, or both. All three nullable so a row can
  -- exist before it is marked -- "Unit 3 test" with no score yet is a real and
  -- useful row.
  score        numeric(8,3),
  out_of       numeric(8,3) check (out_of is null or out_of > 0),
  letter       text,

  weight       numeric(6,3) not null default 1 check (weight >= 0),
  -- The school's own bucket: "Test", "Assignment", "Final exam". Free text
  -- because every school names these differently and a fixed list would make
  -- somebody file their work under the wrong word.
  category     text,
  term         text,
  recorded_on  date,
  notes        text,

  -- Where this row came from. A mark the student typed and a mark a model read
  -- off a photograph are not equally trustworthy, and the app says which is
  -- which rather than presenting both as fact.
  source       text not null default 'manual'
               check (source in ('manual', 'report_card')),

  -- Off. Always off, on every insert, until the student says otherwise.
  shared_with_parents boolean not null default false,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- A score with nothing to be out of is meaningless, and it would render as
  -- "17" next to "85%" as though they were comparable.
  --
  -- This is the only constraint on what a row must say. A draft of this file
  -- also required every dated row to carry a score or a letter, which sounds
  -- reasonable and would have rejected "Unit 3 test, 1 October, not marked
  -- yet" -- the single most useful row a student can create, and the reason
  -- score, out_of and letter are all nullable in the first place.
  constraint grades_score_needs_out_of
    check (score is null or out_of is not null)
);

comment on table grades is
  'Marks. Private by default and shared one row at a time -- see the default on '
  'shared_with_parents, which is the point of the table rather than a setting.';
comment on column grades.source is
  'manual, or report_card when it came from a decoded document. Shown to the '
  'student, because a mark a model read off a photograph is not the same kind '
  'of fact as one they typed.';

create index if not exists grades_owner_class_idx on grades (owner_id, class_id);
create index if not exists grades_assignment_idx  on grades (assignment_id)
  where assignment_id is not null;
create index if not exists grades_term_idx        on grades (owner_id, term)
  where term is not null;

drop trigger if exists grades_touch on grades;
create trigger grades_touch before update on grades
  for each row execute function set_updated_at();

-- ------------------------------------------------------------------ rls ----

alter table grades enable row level security;

-- The one difference from every other shared resource in this schema: there is
-- no `has_share('grade', id)` arm, because 'grade' is deliberately not in the
-- `shareable` enum. Two reasons. Adding a value to an enum and using it in the
-- same migration is a documented trap in this project (plpgsql resolves at
-- call time; the value is not visible to the transaction that added it). And
-- share links are for showing somebody a thing -- a page, a class, a file. A
-- mark is not a document to show; the only person who should ever see it
-- besides the student is a parent they have deliberately linked and
-- deliberately shared with.
drop policy if exists grades_select on grades;
create policy grades_select on grades for select using (
  owner_id = auth.uid()
  or (shared_with_parents and is_linked_parent_of(owner_id))
);

drop policy if exists grades_insert on grades;
create policy grades_insert on grades for insert
  with check (owner_id = auth.uid() and class_owner(class_id) = auth.uid());

drop policy if exists grades_update on grades;
create policy grades_update on grades for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and class_owner(class_id) = auth.uid());

drop policy if exists grades_delete on grades;
create policy grades_delete on grades for delete using (owner_id = auth.uid());

grant select, insert, update, delete on grades to authenticated;
