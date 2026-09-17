-- ============================================================================
-- An announcement never admitted that it had queued a reminder.
--
-- `announce_to_group()` writes `notified` onto `group_announcements`, and the
-- teacher's stream renders "· reminder queued" from it. But the view the app
-- reads -- `announcement_messages` -- never selected that column, so
-- `GroupAnnouncement.notified` was `undefined` at runtime and
-- `Boolean(undefined)` made every announcement say it had notified nobody.
--
-- The reminders were queued. The only place the app says so was wrong, and it
-- was wrong in the safe-looking direction: an under-claim reads as "it did not
-- do the thing" rather than as a bug, so nobody chases it.
--
-- This is the second instance of one shape, six days after the first. The
-- Notifications page said "Reminder" for every row because `subject_title` had
-- no column behind it; this says "no reminder queued" for every announcement
-- because `notified` has none either. Both are a type promising a field the
-- query cannot return, and both were invisible because the reader's `??` or
-- `Boolean()` -- the right thing to write -- turns undefined into a plausible
-- default.
--
-- `src/test/noColumnDrift.test.ts` now holds every star-selected type against
-- the columns behind it, and it is what found this one.
--
-- DROP AND CREATE, NOT CREATE OR REPLACE.
--
-- `create or replace view` may only APPEND columns. Putting `notified` in the
-- middle of the list -- where it belongs, beside the other columns of the
-- announcement itself -- fails with
--
--   ERROR: cannot change name of view column "created_at" to "notified"
--
-- which reads like a rename because positionally that is what it is. Appending
-- it at the end would work and would leave the column order deciding itself by
-- the order in which bugs were found. Nothing depends on this view, so
-- dropping it costs nothing.
--
-- Caught by applying this to a real Postgres before calling it careful. It
-- would have failed on the hosted project otherwise.
--
-- Safe to apply twice.
-- ============================================================================

drop view if exists announcement_messages;

create view announcement_messages with (security_invoker = true) as
  select a.id, a.group_id, a.body, a.notified, a.created_at,
         g.name as group_name, p.full_name as teacher_name
    from group_announcements a
    join teacher_groups g on g.id = a.group_id
    join profiles p       on p.id = a.owner_id;
