-- ============================================================================
-- What the sign-up form asks for: a school, and how a parent is related.
--
-- TWO COLUMNS, AND ONE OF THEM DOES NOTHING YET
--
-- `profiles.school` is free text and, for now, that is all it is. Nothing reads
-- it. Calenda has no school entity -- no schools table, no school_id on
-- anything -- so a `community` event is still visible to every account and
-- school_years still carries a unique index enforcing exactly one current year
-- for everybody. Two schools' students signing up would share one calendar.
--
-- It is collected anyway, on purpose, so the answers exist when the schema
-- catches up. What must not happen is the app implying more than that. The
-- sign-up field says plainly that it does not change what you see yet, and it
-- is a text box rather than a list of names -- a picker of real schools would
-- read as "these are supported", which is the claim that is not true, and the
-- school names are deliberately confined to the landing page.
--
-- `parent_links.relation` sits on the link rather than the profile because it
-- describes a relationship, not a person: the same adult can be a mother to
-- one student and a guardian to another. Free text is wrong here -- these are
-- categories the app may one day group by -- so it is constrained.
--
-- THE COLUMN GRANT IS THE PART THAT IS EASY TO FORGET
--
-- rls.sql revokes update on profiles and re-grants a named list of columns. A
-- new column is not in that list, so without the grant below the sign-up form
-- would write a school into a statement Postgres refuses outright -- taking the
-- name and grade in the same statement down with it, silently, because the
-- result is not checked. That is exactly how the previous attempt at this
-- shipped broken.
-- ============================================================================

alter table profiles add column if not exists school text;

comment on column profiles.school is
  'Free text, self-declared. Nothing reads it yet: there is no school entity '
  'and community events are visible to every account. Collected so the answers '
  'exist when the schema separates schools. See 20260907000300.';

-- The column list from rls.sql, plus school. Stated in full rather than as an
-- addition, because `grant` is additive and a partial list here would read as
-- though the others had been withdrawn.
revoke update on profiles from authenticated;
grant  update (full_name, avatar_url, grade, school, timezone, onboarded_at)
  on profiles to authenticated;

-- ---------------------------------------------------------------------------

create type parent_relation as enum ('mother', 'father', 'guardian', 'other');

alter table parent_links add column if not exists relation parent_relation;

comment on column parent_links.relation is
  'How this parent is related to this student. On the link rather than the '
  'profile: one adult can be a mother to one student and a guardian to '
  'another.';
