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
-- BEFORE RUNNING, fill in the two values at the top of the block below.
--
-- IT REFUSES TO SCHEDULE ANYTHING UNTIL YOU DO.
--
-- The first version of this file had the values as `<PROJECT-REF>` and
-- `<ANON-KEY>` in the middle of a `cron.schedule` call, with an instruction up
-- here to replace them. Run as-is on 2026-09-10, it cheerfully scheduled a job
-- that POSTed to the literal string 'https://<PROJECT-REF>.supabase.co/...'
-- every fifteen minutes -- resolving nowhere, reporting itself as an active
-- cron job, and delivering nothing. `select * from cron.job` looked perfect.
--
-- That is the third time this one feature has produced a green light with
-- nothing behind it: the hourly workflow that exited early on an unset secret,
-- a dispatcher that counted an expired subscription as a delivery, and this.
-- A setup file that can be run wrongly, silently, is a setup file that will be.
--
-- The anon key is only used to reach the function; the function itself runs as
-- the service role from its own secrets, which never appear here. It is also
-- already public -- it ships in the site's JavaScript bundle by design.
-- ---------------------------------------------------------------------------


-- 1. The two extensions this needs. Both are available on the free plan.
create extension if not exists pg_cron  with schema extensions;
create extension if not exists pg_net   with schema extensions;


-- 2. The schedule itself.
--
--    Unscheduling first makes re-running safe: it cannot leave two dispatchers
--    racing. (They would not double-send -- claiming is done under `for update
--    skip locked` -- but two is still one too many.)
--
--    Every 15 minutes. Reminder offsets are hours and days, so a quarter-hour
--    resolution is comfortably finer than anything it delivers, and it keeps
--    the request count well inside the free plan.
do $do$
declare
  -- ======================================================================
  -- EDIT THESE TWO LINES, THEN RUN THE WHOLE FILE.
  --   project_ref : Project Settings -> General -> Reference ID
  --   anon_key    : Project Settings -> API -> anon / public
  -- ======================================================================
  project_ref text := 'REPLACE-WITH-PROJECT-REF';
  anon_key    text := 'REPLACE-WITH-ANON-KEY';
begin
  if project_ref like 'REPLACE-%' or anon_key like 'REPLACE-%' then
    raise exception
      'Fill in project_ref and anon_key at the top of this block first. Nothing was scheduled.';
  end if;

  -- A weak check, and it earns its place: pasting the project ref into both
  -- boxes, or reaching for the service-role key (`sbp_...`) out of habit, are
  -- the two ways this goes wrong that still look plausible on screen.
  if anon_key not like 'eyJ%' then
    raise exception
      'That does not look like an anon key -- they are JWTs and begin "eyJ". Nothing was scheduled.';
  end if;

  perform cron.unschedule('calenda-notify')
    where exists (select 1 from cron.job where jobname = 'calenda-notify');

  perform cron.schedule(
    'calenda-notify',
    '*/15 * * * *',
    format($job$
      select net.http_post(
        url     := %L,
        headers := jsonb_build_object(
                     'Content-Type',  'application/json',
                     'Authorization', %L
                   ),
        body    := '{}'::jsonb,
        timeout_milliseconds := 30000
      );
    $job$,
      'https://' || project_ref || '.supabase.co/functions/v1/notify-dispatch',
      'Bearer ' || anon_key)
  );

  raise notice 'Scheduled calenda-notify every 15 minutes.';
end
$do$;


-- 3. Confirm it is registered AND that it points somewhere real. The second
--    column is the one that matters: an active job is not a working one.
select jobname,
       schedule,
       active,
       command like '%REPLACE-%' or command like '%<PROJECT-REF>%' as has_placeholder,
       command like '%supabase.co/functions/v1/notify-dispatch%'   as url_looks_right
  from cron.job where jobname = 'calenda-notify';


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
