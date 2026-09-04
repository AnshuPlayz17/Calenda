-- ---------------------------------------------------------------------------
-- Clear test data for one account.
--
-- Run in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query). This
-- cannot be run from the app.
--
-- Run the sections ONE AT A TIME, in order. Section 1 only looks. Sections 2
-- and 3 delete, each inside its own transaction so you can check the numbers
-- and type `rollback;` instead of `commit;` if they are wrong.
--
-- Set your email once here, and use the same value everywhere below.
--   anshuarunav@gmail.com
-- ---------------------------------------------------------------------------


-- === 1. LOOK FIRST =========================================================
-- Changes nothing. Check these counts look like what you expect.

with me as (
  select id from auth.users where email = 'anshuarunav@gmail.com'
)
select 'classes'                              as what, count(*) as rows from classes            where owner_id = (select id from me)
union all
select 'assignments in those classes',        count(*) from assignments a join classes c on c.id = a.class_id where c.owner_id = (select id from me)
union all
select 'notebook pages in those classes',     count(*) from notebook_pages n join classes c on c.id = n.class_id where c.owner_id = (select id from me)
union all
select 'tasks in those classes',              count(*) from tasks t join classes c on c.id = t.class_id where c.owner_id = (select id from me)
union all
select 'your suggestions (any status)',       count(*) from events where owner_id = (select id from me) and source = 'suggestion'
union all
select 'your own events added by hand',       count(*) from events where owner_id = (select id from me) and source = 'manual'
union all
select 'SHARED school calendar (section 3)',  count(*) from events where source = 'pdf_import'
union all
select 'imported from your Google calendar',  count(*) from events where owner_id = (select id from me) and source = 'google';


-- === 2. YOUR STUFF =========================================================
-- Classes and everything inside them, your suggestions whatever the admin
-- decided, and events you typed in yourself. Leaves the school calendar alone.

begin;

with me as (
  select id from auth.users where email = 'anshuarunav@gmail.com'
)
, gone_assignments as (
  delete from assignments a using classes c
   where c.id = a.class_id and c.owner_id = (select id from me)
  returning a.id
)
, gone_pages as (
  delete from notebook_pages n using classes c
   where c.id = n.class_id and c.owner_id = (select id from me)
  returning n.id
)
, gone_tasks as (
  delete from tasks t using classes c
   where c.id = t.class_id and c.owner_id = (select id from me)
  returning t.id
)
, gone_classes as (
  delete from classes where owner_id = (select id from me)
  returning id
)
, gone_suggestions as (
  -- Every suggestion you made, approved / pending / rejected alike.
  delete from events
   where owner_id = (select id from me) and source = 'suggestion'
  returning id
)
, gone_manual as (
  -- Events you created by hand. 'manual' never includes imported dates.
  delete from events
   where owner_id = (select id from me) and source = 'manual'
  returning id
)
, gone_google as (
  delete from events
   where owner_id = (select id from me) and source = 'google'
  returning id
)
select
  (select count(*) from gone_classes)     as classes_deleted,
  (select count(*) from gone_assignments) as assignments_deleted,
  (select count(*) from gone_pages)       as pages_deleted,
  (select count(*) from gone_tasks)       as tasks_deleted,
  (select count(*) from gone_suggestions) as suggestions_deleted,
  (select count(*) from gone_manual)      as manual_events_deleted,
  (select count(*) from gone_google)      as google_events_deleted;

-- Numbers look right?
commit;
-- If not, run this instead and nothing is lost:
-- rollback;


-- === 3. THE SHARED SCHOOL CALENDAR (optional) ==============================
-- ONLY run this if you also want the 49 imported school dates gone.
--
-- These are not your personal data -- they are the shared calendar everyone
-- sees. Deleting them removes them for every account, not just yours.
--
-- It is recoverable: Admin -> Import the school calendar puts them all back in
-- one click, and the duplicate check will find nothing to warn about because
-- the table will be empty.
--
-- Uncomment the three lines below to run it.

-- begin;
-- delete from events where source = 'pdf_import' returning title, start_date;
-- commit;


-- === 4. TIDY UP ============================================================
-- Reminders were queued against things that no longer exist. Nothing sends
-- them yet, so this is housekeeping rather than a fix.

delete from notification_queue
 where profile_id = (select id from auth.users where email = 'anshuarunav@gmail.com');
