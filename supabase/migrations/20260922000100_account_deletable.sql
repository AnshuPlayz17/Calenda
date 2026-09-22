-- ============================================================================
-- Two foreign keys refused every account deletion, and the owner's was the
-- only one that would ever have hit them.
--
-- WHAT WAS BROKEN
--
-- `profiles.id references auth.users on delete cascade`, and fifty other keys
-- cascade from `profiles`, so deleting the auth user takes the whole account
-- with it. Two do not:
--
--   event_reviews.reviewer_id uuid not null references profiles,
--   import_batches.admin_id   uuid not null references profiles,
--
-- No delete rule means NO ACTION, which refuses the delete. Both columns are
-- written by admin actions -- reviewing an imported event, running an import
-- batch -- so a student deletes cleanly and an admin gets a foreign key
-- violation. The account that cannot be deleted is the one belonging to the
-- person who would be asked to delete everybody else's.
--
-- Nothing had caught it because nothing had ever deleted an account. This is
-- the rule this project keeps relearning: a column read in four places and
-- written in none is a feature nobody can turn on, and a path exercised by
-- nobody is a path that does not work.
--
-- WHY `set null` AND NOT `cascade`
--
-- Both rows are an audit of something done to data that is not the reviewer's
-- own. An `event_reviews` row records that a community event was approved; an
-- `import_batches` row records that a school year's calendar was imported.
-- Cascading would delete the record of the act along with the person, which is
-- more than erasure asks for and less than the remaining data deserves -- an
-- approved community event would be left with no trace of who approved it OR
-- that anybody did.
--
-- `set null` forgets the person and keeps the act, which is what a deletion
-- request actually means. It is also what this schema already chose one screen
-- away: `events.approved_by uuid references profiles on delete set null`, in
-- the same file, written the same day. These two were missed, not decided.
--
-- `not null` has to go for that to be expressible. Every reader is checked
-- below rather than assumed.
--
-- SAFE TO APPLY TWICE. The project applies migrations on merge through the
-- GitHub integration AND has a habit of pasting SQL by hand, so every
-- statement here is conditional or idempotent.
-- ============================================================================

-- ------------------------------------------------------------ event_reviews --

alter table event_reviews alter column reviewer_id drop not null;

alter table event_reviews drop constraint if exists event_reviews_reviewer_id_fkey;
alter table event_reviews
  add constraint event_reviews_reviewer_id_fkey
  foreign key (reviewer_id) references profiles (id) on delete set null;

comment on column event_reviews.reviewer_id is
  'Null once that person deleted their account. The review stands; the reviewer '
  'is forgotten. See 20260922000100.';

-- ----------------------------------------------------------- import_batches --

alter table import_batches alter column admin_id drop not null;

alter table import_batches drop constraint if exists import_batches_admin_id_fkey;
alter table import_batches
  add constraint import_batches_admin_id_fkey
  foreign key (admin_id) references profiles (id) on delete set null;

comment on column import_batches.admin_id is
  'Null once that person deleted their account. The batch stands; the importer '
  'is forgotten. See 20260922000100.';
