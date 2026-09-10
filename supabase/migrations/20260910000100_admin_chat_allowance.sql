-- ---------------------------------------------------------------------------
-- An admin's chat allowance is not capped.
--
-- `claim_chat_message()` refuses everybody at forty messages a day. That number
-- exists because Groq's free tier is one shared allowance across every user of
-- this project, and forty a person is low enough that a handful of people
-- cannot exhaust it between them before evening.
--
-- An admin is not a handful of people. There is one, they hold the database,
-- and they are the person testing the thing -- so being cut off at forty while
-- checking whether a change worked is a limit doing the opposite of its job.
--
-- WHAT THIS DOES NOT DO
--
-- It does not give anybody unlimited tokens. Nothing in this database can:
-- the per-minute and per-day ceilings belong to the model provider, and an
-- admin who runs into Groq's own rate limit gets the same 429 as anybody else
-- -- now with a message that says to wait a minute rather than blaming the
-- file. The only limit this project owns is the daily message count, and that
-- is the only one being lifted.
--
-- USAGE IS STILL RECORDED. The row still increments, so `chat_usage` remains
-- an honest account of what was spent against the shared free tier. Only the
-- refusal is skipped. A counter that stops counting for the one person most
-- likely to be spending the allowance would make the table useless for the one
-- question it exists to answer.
-- ---------------------------------------------------------------------------

create or replace function claim_chat_message()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  daily_limit constant integer := 40;
  claimed integer;
begin
  if auth.uid() is null then
    return false;
  end if;

  -- Admin: record it, never refuse it. `is_admin()` reads the role column,
  -- which no client can write -- the grant in rls.sql omits `role`, and
  -- Postgres checks column privileges before RLS. So this cannot be reached by
  -- somebody who has decided they are an admin.
  if is_admin() then
    insert into chat_usage (owner_id, day, used)
    values (auth.uid(), current_date, 1)
    on conflict (owner_id, day) do update
      set used = chat_usage.used + 1;
    return true;
  end if;

  insert into chat_usage (owner_id, day, used)
  values (auth.uid(), current_date, 1)
  on conflict (owner_id, day) do update
    set used = chat_usage.used + 1
    where chat_usage.used < daily_limit
  returning used into claimed;

  return claimed is not null;
end;
$$;

revoke all on function claim_chat_message() from public;
grant execute on function claim_chat_message() to authenticated;

comment on function claim_chat_message is
  'Atomically claims one message against today''s allowance. No parameters: a '
  'caller-supplied limit is not a limit. Returns false when spent. An admin is '
  'recorded but never refused -- see 20260910000100 for why the recording '
  'matters as much as the exemption.';
