-- ---------------------------------------------------------------------------
-- Run the reminder dispatcher every 15 minutes, from inside the database.
--
-- Run this in the Supabase SQL Editor AFTER deploying the notify-dispatch
-- Edge Function. It is separate from the migrations because it embeds a
-- secret, and a secret does not belong in a file that is committed and
-- replayed on every environment.
--
-- Why in-database rather than a CI cron: a scheduled GitHub Actions workflow
-- is disabled automatically after 60 days of repository inactivity -- which is
-- roughly a summer holiday -- and its schedule is best-effort, often running
-- late. pg_cron runs on time and keeps running.
--
-- ---------------------------------------------------------------------------
-- BEFORE RUNNING, replace both placeholders below:
--
--   <PROJECT-REF>  your Supabase project ref, e.g. zibtznqyfffbdmtjjitv
--   <ANON-KEY>     Settings -> API -> anon / public key
--
-- The anon key is only used to reach the function; the function itself runs
-- as the service role from its own secrets, which never appear here.
-- ---------------------------------------------------------------------------


-- 1. The two extensions this needs. Both are available on the free plan.
create extension if not exists pg_cron  with schema extensions;
create extension if not exists pg_net   with schema extensions;


-- 2. Remove any previous schedule, so re-running this file is safe and cannot
--    leave two dispatchers racing. (They would not double-send -- claiming is
--    done under `for update skip locked` -- but two is still one too many.)
select cron.unschedule('calenda-notify')
 where exists (select 1 from cron.job where jobname = 'calenda-notify');


-- 3. Every 15 minutes. Reminder offsets are hours and days, so a quarter-hour
--    resolution is comfortably finer than anything it delivers, and it keeps
--    the request count low enough to stay well inside the free plan.
select cron.schedule(
  'calenda-notify',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT-REF>.supabase.co/functions/v1/notify-dispatch',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer <ANON-KEY>'
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);


-- 4. Confirm it is registered.
select jobid, jobname, schedule, active from cron.job where jobname = 'calenda-notify';


-- ---------------------------------------------------------------------------
-- Checking on it later
-- ---------------------------------------------------------------------------
--
-- Did the cron job run, and did the HTTP call succeed?
--
--   select status, return_message, start_time
--     from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'calenda-notify')
--    order by start_time desc limit 10;
--
-- What is waiting to go out?
--
--   select state, channel, count(*)
--     from notification_queue group by state, channel order by state;
--
-- What actually went out?
--
--   select channel, subject, created_at
--     from notification_deliveries order by created_at desc limit 20;
--
-- 'skipped' means the channel had no sender configured -- not a failure.
-- 'failed' means it tried and could not; the error column says why.
--
-- To stop it:
--
--   select cron.unschedule('calenda-notify');
-- ---------------------------------------------------------------------------
