-- ============================================================================
-- The reminders list said "Reminder" to everybody, for everything.
--
-- WHAT WAS ON THE SCREEN
--
-- The Notifications page lists what is coming up. Every row read
--
--     Reminder
--     1 day before · push
--
-- for an event, an assignment, a task and an announcement alike. A list of six
-- identical lines is not a list.
--
-- WHY
--
-- `listQueuedReminders` does `select('*')` from `notification_queue`, and that
-- table has no title. It holds `subject_type` and `subject_id` and nothing
-- else about what the reminder is for -- deliberately, because duplicating a
-- title into the queue means a renamed event keeps the old name in the
-- reminder. So `r.subject_title` is `undefined` at runtime and the reader's
-- `?? 'Reminder'` turns that into a word.
--
-- This is the trap CLAUDE.md records for `loadProfile`, one step worse. There a
-- column existed and was left out of the select, which made never-fetched
-- indistinguishable from never-set. Here the column never existed at all.
--
-- WHY NOBODY SAW IT
--
-- `previewSource` sets `subject_title: e.title` when it seeds the queue. Every
-- audit this project has ever run goes in through preview, because preview is
-- the only way into the app from a container that cannot reach Supabase. So
-- every check saw real titles and every real user saw the word "Reminder".
--
-- **A preview that supplies a field the real source cannot is not a preview of
-- the app.** That is the general lesson and it is worth more than this fix.
--
-- THE FIX
--
-- A view, resolved on read rather than copied on write, so a renamed event
-- renames its reminder. `security_invoker = true` means it runs as the caller
-- and inherits every policy underneath: a title you could not open in a tab is
-- a title this cannot show you either.
--
-- An announcement's title is its class's name, which is what the dispatcher
-- puts on the push for the same reason -- a lock screen should say which class
-- before it says the words.
--
-- Safe to apply twice.
-- ============================================================================

create or replace view queued_reminders with (security_invoker = true) as
  select q.id,
         q.profile_id,
         q.subject_type,
         q.subject_id,
         q.channel,
         q.offset_minutes,
         q.scheduled_for,
         q.state,
         q.attempts,
         q.sent_at,
         q.error,
         q.created_at,
         -- One of these is non-null per row, by subject_type. A 'digest' has no
         -- subject and stays null, which the screen already renders as a plain
         -- "Reminder" -- correct there, because a digest is not about one thing.
         coalesce(e.title, a.title, t.title, tg.name) as subject_title
    from notification_queue q
    left join events      e  on q.subject_type = 'event'        and e.id  = q.subject_id
    left join assignments a  on q.subject_type = 'assignment'   and a.id  = q.subject_id
    left join tasks       t  on q.subject_type = 'task'         and t.id  = q.subject_id
    left join group_announcements ga
                             on q.subject_type = 'announcement' and ga.id = q.subject_id
    left join teacher_groups tg on tg.id = ga.group_id;

comment on view queued_reminders is
  'notification_queue with the subject''s own title resolved on read. Titles are '
  'not copied into the queue: a renamed event must rename its reminder.';
