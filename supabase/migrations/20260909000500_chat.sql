-- ============================================================================
-- The assistant's threads, messages, and the quota that stops one person
-- spending everybody's.
--
-- WHAT THIS SCHEMA DOES NOT CONTAIN
--
-- There is no table of context, no embeddings, no copy of anybody's notes.
-- The assistant reads the same tables the app reads, through the same policies,
-- **as the signed-in user** -- the Edge Function forwards their JWT rather than
-- using the service role. That is the single most important decision in this
-- feature. A service-role assistant is one prompt injection in one shared note
-- away from reading every account in the database; a JWT-scoped one cannot
-- read anything its user could not already open in a tab.
--
-- THE QUOTA IS A SERVER SIDE NUMBER, AND THAT IS THE ENTIRE POINT
--
-- The model's free tier is a shared daily allowance. The arithmetic is the same
-- one that decided the email setting: whatever the provider gives per day,
-- divided by the number of people who could burn it, and the answer has to hold
-- even when one of them is trying. So the limit is a constant inside a definer
-- function -- not a parameter, because a client that passes its own limit has
-- no limit, and not a column a client can update, for the same reason.
--
-- Changing the number means a migration. That is deliberate. It is a
-- security-relevant constant and it should be as hard to change quietly as
-- every other one in this schema.
-- ============================================================================

create table if not exists chat_threads (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references profiles on delete cascade,
  -- Named from the first question rather than asked for. Nobody titles a
  -- conversation before having it.
  title      text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_threads_owner_idx
  on chat_threads (owner_id, updated_at desc);

drop trigger if exists chat_threads_touch on chat_threads;
create trigger chat_threads_touch before update on chat_threads
  for each row execute function set_updated_at();

create table if not exists chat_messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references chat_threads on delete cascade,
  owner_id   uuid not null references profiles on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,

  -- What the assistant actually looked at to answer, as a list of
  -- {kind, id, title}. Not for the model -- for the reader. An answer about
  -- "your Functions test" that cannot say which row it read is an answer
  -- nobody should act on, and this is what lets the UI put the sources under
  -- the reply and link them.
  sources    jsonb not null default '[]'::jsonb,

  -- Said rather than swallowed, same as everywhere else in this app. A reply
  -- that failed halfway is a row with an error, not a missing row.
  error      text,

  created_at timestamptz not null default now()
);

create index if not exists chat_messages_thread_idx
  on chat_messages (thread_id, created_at);

comment on column chat_messages.sources is
  'What the answer was based on: [{kind, id, title}]. Shown under the reply. An '
  'assistant that cannot say what it read is one whose answers cannot be '
  'checked, and this app''s whole argument is that its contents are checkable.';

-- --------------------------------------------------------------- quota -----

create table if not exists chat_usage (
  owner_id uuid not null references profiles on delete cascade,
  day      date not null default current_date,
  used     integer not null default 0 check (used >= 0),
  primary key (owner_id, day)
);

comment on table chat_usage is
  'One row per person per day. Written only by claim_chat_message(); clients '
  'have no update grant on it, or the limit would be advisory.';

-- ------------------------------------------------------------------ rls ----

alter table chat_threads  enable row level security;
alter table chat_messages enable row level security;
alter table chat_usage    enable row level security;

drop policy if exists chat_threads_all on chat_threads;
create policy chat_threads_all on chat_threads for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists chat_messages_all on chat_messages;
create policy chat_messages_all on chat_messages for all
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from chat_threads t
       where t.id = chat_messages.thread_id and t.owner_id = auth.uid()
    )
  );

-- Readable so the UI can say "9 of 40 left today" honestly, and writable by
-- nobody. The grant below is select-only for exactly this reason: a client
-- that can update its own usage row can set it to zero.
drop policy if exists chat_usage_select on chat_usage;
create policy chat_usage_select on chat_usage for select
  using (owner_id = auth.uid());

grant select, insert, update, delete on chat_threads  to authenticated;
grant select, insert, update, delete on chat_messages to authenticated;
revoke all on chat_usage from authenticated;
grant select on chat_usage to authenticated;

-- ---------------------------------------------------------------------------
-- Claim one message against today's allowance.
--
-- Returns true if the caller may send, false if they are out. Takes no
-- arguments: a limit passed in by the caller is a limit chosen by the caller.
--
-- The `where` on the conflict branch is what makes this atomic. Two requests
-- arriving together both attempt the update; the one that would take `used`
-- past the limit updates no row, so `returning` yields nothing, `found` is
-- false, and it is refused. No read-then-write gap for a second request to
-- slip through.
-- ---------------------------------------------------------------------------

create or replace function claim_chat_message()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Groq's free tier is a shared daily allowance across every user of this
  -- project. Forty a person is generous for a school day and low enough that
  -- a handful of people cannot exhaust it between them before evening, which
  -- is when homework actually gets done.
  daily_limit constant integer := 40;
  claimed integer;
begin
  if auth.uid() is null then
    return false;
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
  'caller-supplied limit is not a limit. Returns false when spent.';
