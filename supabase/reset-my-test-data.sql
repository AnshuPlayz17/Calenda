-- ---------------------------------------------------------------------------
-- Reset one account's test data back to how it looked before testing.
--
-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
-- It cannot be run from the app, and it deliberately does NOT touch the 49
-- imported school calendar dates -- those existed before testing and should
-- stay.
--
-- Read section 1 before running section 2. Section 1 only looks; section 2
-- deletes. Run them as two separate queries so you see what will go first.
-- ---------------------------------------------------------------------------


-- === 1. LOOK FIRST =========================================================
-- Run this on its own. It changes nothing. Check the counts look like what
-- you expect before running section 2.

with me as (
  select id from auth.users where email = 'anshuarunav@gmail.com'
)
select 'classes'                as what,
       count(*)                 as rows_that_will_be_deleted
  from classes where owner_id = (select id from me)
union all
select 'assignments (in those classes)',
       count(*)
  from assignments a
  join classes c on c.id = a.class_id
 where c.owner_id = (select id from me)
union all
select 'notebook pages (in those classes)',
       count(*)
  from notebook_pages n
  join classes c on c.id = n.class_id
 where c.owner_id = (select id from me)
union all
select 'tasks (in those classes)',
       count(*)
  from tasks t
  join classes c on c.id = t.class_id
 where c.owner_id = (select id from me)
union all
select 'community suggestions you submitted',
       count(*)
  from events
 where owner_id = (select id from me)
   and visibility = 'community'
   and source = 'suggestion'
union all
select 'personal events you created by hand',
       count(*)
  from events
 where owner_id = (select id from me)
   and visibility = 'private'
   and source = 'manual'
union all
select 'KEPT: imported school calendar dates',
       count(*)
  from events
 where source = 'pdf_import';


-- === 2. DELETE =============================================================
-- Only run this once section 1 looks right. One transaction: it all applies
-- or none of it does.

begin;

with me as (
  select id from auth.users where email = 'anshuarunav@gmail.com'
)
-- Classes go last, so their assignments/pages/tasks are removed first even
-- where a cascade would not have covered them.
, gone_assignments as (
  delete from assignments a
   using classes c
   where c.id = a.class_id
     and c.owner_id = (select id from me)
  returning a.id
)
, gone_pages as (
  delete from notebook_pages n
   using classes c
   where c.id = n.class_id
     and c.owner_id = (select id from me)
  returning n.id
)
, gone_tasks as (
  delete from tasks t
   using classes c
   where c.id = t.class_id
     and c.owner_id = (select id from me)
  returning t.id
)
, gone_classes as (
  delete from classes
   where owner_id = (select id from me)
  returning id
)
, gone_suggestions as (
  -- Everything you suggested during testing, whatever the admin decided.
  delete from events
   where owner_id = (select id from me)
     and visibility = 'community'
     and source = 'suggestion'
  returning id
)
, gone_personal as (
  -- Events you typed in yourself. Imported school dates are untouched
  -- because their source is 'pdf_import', not 'manual'.
  delete from events
   where owner_id = (select id from me)
     and visibility = 'private'
     and source = 'manual'
  returning id
)
select
  (select count(*) from gone_classes)     as classes_deleted,
  (select count(*) from gone_assignments) as assignments_deleted,
  (select count(*) from gone_pages)       as notebook_pages_deleted,
  (select count(*) from gone_tasks)       as tasks_deleted,
  (select count(*) from gone_suggestions) as suggestions_deleted,
  (select count(*) from gone_personal)    as personal_events_deleted;

-- Check the numbers above. If they look right:
commit;
-- If they do not, run this instead and nothing is lost:
-- rollback;


-- === 3. OPTIONAL: also clear queued reminders ===============================
-- Reminders were scheduled against the things you just deleted. Nothing sends
-- them yet, so this is tidiness rather than a fix.
--
-- delete from notification_queue
--  where profile_id = (select id from auth.users
--                       where email = 'anshuarunav@gmail.com');
