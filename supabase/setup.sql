-- ============================================================================
-- Calenda -- complete database setup
--
-- Paste this whole file into the Supabase SQL Editor and run it once.
-- Generated from supabase/migrations/ -- do not edit by hand.
--
-- The whole thing runs inside a single transaction, so it is ALL-OR-NOTHING.
-- If anything fails -- a dropped connection, a platform incident, a partial
-- paste -- nothing is applied and the database is left untouched. Just run it
-- again. There is never a half-built state to clean up.
--
-- It also records each migration in supabase_migrations.schema_migrations, the
-- table the Supabase CLI and GitHub integration use to track what has already
-- been applied. So running this by hand does NOT conflict with the GitHub
-- integration: when it later deploys, it sees these as done and skips them.
--
-- Verified against PostgreSQL 16.
--
-- Afterwards, sign in to Calenda once, then make yourself the admin:
--
--   update profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'you@example.com');
-- ============================================================================

begin;

set local statement_timeout = '120s';

-- Present on hosted Supabase projects; created here so the file also works on
-- a plain PostgreSQL database.
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);

-- Enabled with no policies, so it is default-deny. The schema is not exposed
-- through PostgREST either, but Supabase's SQL editor rightly warns about any
-- table created without RLS, and there is no reason to be the exception.
-- Supabase's own migration tooling writes this as the service role, which
-- bypasses RLS, so nothing is broken by locking it down.
alter table supabase_migrations.schema_migrations enable row level security;

-- ===========================================================================
-- 20260904000100_init.sql
-- ===========================================================================

-- ============================================================================
-- Calenda -- initial schema
--
-- Read alongside docs/DATA-MODEL.md. Every table enables row-level security
-- and starts from default-deny; the policies at the end of this file are the
-- actual permission boundary, not the UI.
-- ============================================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------ types --

create type user_role        as enum ('student', 'parent', 'admin');
create type link_status      as enum ('pending', 'accepted', 'revoked');
create type share_permission as enum ('view', 'comment', 'edit');
create type shareable        as enum ('event','class','notebook_page','assignment','task','file');
create type event_visibility as enum ('private', 'community');
create type event_status     as enum ('draft', 'pending', 'approved', 'rejected');
create type event_source     as enum ('manual', 'pdf_import', 'google', 'suggestion');
create type dedupe_status    as enum ('new', 'likely_duplicate', 'exact_duplicate', 'resolved');
create type sync_direction   as enum ('import_only', 'export_only', 'two_way');
create type work_status      as enum ('not_started', 'in_progress', 'completed');
create type work_priority    as enum ('low', 'normal', 'high');
create type notify_channel   as enum ('email', 'web_push', 'sms');
create type notify_state     as enum ('pending', 'sent', 'failed', 'skipped');

-- -------------------------------------------------------------- utilities --

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- --------------------------------------------------------------- identity --

create table profiles (
  id           uuid primary key references auth.users on delete cascade,
  full_name    text,
  avatar_url   text,
  role         user_role   not null default 'student',
  grade        text,
  timezone     text        not null default 'America/Toronto',
  onboarded_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger profiles_touch before update on profiles
  for each row execute function set_updated_at();

-- A profile row must exist for every auth user, created server-side so the
-- client never chooses its own role.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create table parent_links (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid not null references profiles on delete cascade,
  student_id  uuid not null references profiles on delete cascade,
  status      link_status not null default 'pending',
  invite_code text unique,
  accepted_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (parent_id, student_id),
  constraint parent_link_not_self check (parent_id <> student_id)
);
create index parent_links_student_idx on parent_links (student_id, status);
create index parent_links_parent_idx  on parent_links (parent_id, status);

create table shares (
  id            uuid primary key default gen_random_uuid(),
  resource_type shareable not null,
  resource_id   uuid not null,
  grantee_id    uuid not null references profiles on delete cascade,
  granted_by    uuid not null references profiles on delete cascade,
  permission    share_permission not null default 'view',
  created_at    timestamptz not null default now(),
  unique (resource_type, resource_id, grantee_id)
);
create index shares_lookup_idx on shares (grantee_id, resource_type, resource_id);

-- ---------------------------------------------------------- school shape --

create table school_years (
  id         uuid primary key default gen_random_uuid(),
  label      text not null unique,
  starts_on  date not null,
  ends_on    date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  constraint school_year_ordered check (ends_on > starts_on)
);
-- At most one current year, enforced rather than assumed.
create unique index school_years_one_current on school_years (is_current) where is_current;

create table event_categories (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  color_token text not null,
  icon       text,
  sort_order int  not null default 0,
  is_system  boolean not null default false
);

create table event_series (
  id             uuid primary key default gen_random_uuid(),
  school_year_id uuid not null references school_years on delete cascade,
  name           text not null,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------- import --

create table import_batches (
  id             uuid primary key default gen_random_uuid(),
  admin_id       uuid not null references profiles,
  school_year_id uuid not null references school_years,
  source         event_source not null,
  filename       text,
  stats          jsonb not null default '{}'::jsonb,
  committed_at   timestamptz,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------- events --

create table events (
  id             uuid primary key default gen_random_uuid(),
  school_year_id uuid not null references school_years,
  category_id    uuid references event_categories on delete set null,
  series_id      uuid references event_series on delete set null,
  owner_id       uuid not null references profiles on delete cascade,

  title       text not null check (length(trim(title)) > 0),
  description text,
  location    text,
  priority    smallint not null default 0,

  -- All-day events are stored date-only and timezone-free. Storing them as
  -- timestamps renders Thanksgiving on Oct 11 for anyone west of UTC.
  is_all_day boolean not null,
  start_date date not null,
  end_date   date not null,
  start_at   timestamptz,
  end_at     timestamptz,

  visibility          event_visibility not null default 'private',
  status              event_status     not null default 'approved',
  shared_with_parents boolean          not null default false,

  approved_by uuid references profiles on delete set null,
  approved_at timestamptz,
  review_note text,

  source          event_source not null default 'manual',
  import_batch_id uuid references import_batches on delete set null,

  -- Dedupe identity: normalised title PLUS start date. Title alone would
  -- collapse the 16 byte-identical "Late Start" entries.
  content_hash text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(location, '')), 'C')
  ) stored,

  constraint event_allday_has_no_instant check (is_all_day = (start_at is null)),
  constraint event_dates_ordered        check (end_date >= start_date),
  constraint event_instants_ordered     check (end_at is null or end_at >= start_at),
  -- Private events can never sit in a pending state; approval exists only for
  -- community content.
  constraint event_private_is_approved
    check (visibility = 'community' or status = 'approved')
);
create trigger events_touch before update on events
  for each row execute function set_updated_at();

create index events_year_start_idx  on events (school_year_id, start_date);
create index events_range_idx       on events (start_date, end_date);
create index events_owner_idx       on events (owner_id, start_date);
create index events_community_idx   on events (visibility, status, start_date)
  where visibility = 'community';
create index events_pending_idx     on events (status) where status = 'pending';
create index events_search_idx      on events using gin (search_vector);
create index events_dedupe_idx      on events (content_hash, start_date);
create index events_series_idx      on events (series_id) where series_id is not null;

create table event_reviews (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events on delete cascade,
  reviewer_id uuid not null references profiles,
  action      text not null check (action in ('approved','rejected','edited')),
  note        text,
  created_at  timestamptz not null default now()
);
create index event_reviews_event_idx on event_reviews (event_id, created_at desc);

create table import_staging (
  id             uuid primary key default gen_random_uuid(),
  batch_id       uuid not null references import_batches on delete cascade,
  raw            jsonb not null,
  parsed         jsonb not null,
  status         dedupe_status not null default 'new',
  match_event_id uuid references events on delete set null,
  match_score    numeric(4,3),
  resolution     text check (resolution in
                   ('keep_existing','add_anyway','merge','replace','cancel')),
  created_at     timestamptz not null default now()
);
create index import_staging_batch_idx on import_staging (batch_id, status);

-- --------------------------------------------------------------- classes --

create table classes (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references profiles on delete cascade,
  school_year_id uuid not null references school_years,
  name           text not null check (length(trim(name)) > 0),
  course_code    text,
  teacher        text,
  room           text,
  color_token    text,
  is_archived    boolean not null default false,
  archived_at    timestamptz,
  shared_with_parents boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (owner_id, school_year_id, name)
);
create trigger classes_touch before update on classes
  for each row execute function set_updated_at();
create index classes_owner_idx on classes (owner_id, school_year_id) where not is_archived;
create index classes_code_idx  on classes (course_code) where course_code is not null;

create table notebook_pages (
  id             uuid primary key default gen_random_uuid(),
  class_id       uuid not null references classes on delete cascade,
  owner_id       uuid not null references profiles on delete cascade,
  parent_page_id uuid references notebook_pages on delete cascade,
  title          text not null default 'Untitled',
  icon           text,
  content        jsonb not null default '{}'::jsonb,
  content_text   text  not null default '',
  -- Fractional ordering: reordering rewrites one row, not every sibling.
  position       numeric not null default 0,
  is_archived    boolean not null default false,
  shared_with_parents boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  search_vector  tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content_text, '')), 'B')
  ) stored
);
create trigger notebook_pages_touch before update on notebook_pages
  for each row execute function set_updated_at();
create index notebook_tree_idx   on notebook_pages (class_id, parent_page_id, position);
create index notebook_search_idx on notebook_pages using gin (search_vector);
create index notebook_recent_idx on notebook_pages (owner_id, updated_at desc);

create table assignments (
  id                uuid primary key default gen_random_uuid(),
  class_id          uuid not null references classes on delete cascade,
  owner_id          uuid not null references profiles on delete cascade,
  title             text not null check (length(trim(title)) > 0),
  description       text,
  due_at            timestamptz,
  due_all_day       boolean not null default false,
  priority          work_priority not null default 'normal',
  status            work_status   not null default 'not_started',
  estimated_minutes int check (estimated_minutes is null or estimated_minutes > 0),
  -- The assignment owns its calendar mirror, so the user never enters it twice.
  event_id          uuid references events on delete set null,
  completed_at      timestamptz,
  shared_with_parents boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger assignments_touch before update on assignments
  for each row execute function set_updated_at();
create index assignments_due_idx   on assignments (owner_id, status, due_at);
create index assignments_class_idx on assignments (class_id, due_at);

create table tasks (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references profiles on delete cascade,
  class_id     uuid references classes on delete cascade,
  title        text not null check (length(trim(title)) > 0),
  notes        text,
  due_at       timestamptz,
  priority     work_priority not null default 'normal',
  status       work_status   not null default 'not_started',
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger tasks_touch before update on tasks
  for each row execute function set_updated_at();
create index tasks_owner_idx on tasks (owner_id, status, due_at);

create table files (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null references classes on delete cascade,
  owner_id     uuid not null references profiles on delete cascade,
  storage_path text not null unique,
  filename     text not null,
  mime_type    text not null,
  size_bytes   bigint not null check (size_bytes >= 0),
  shared_with_parents boolean not null default false,
  created_at   timestamptz not null default now()
);
create index files_class_idx on files (class_id, created_at desc);

create table file_links (
  file_id     uuid not null references files on delete cascade,
  target_type shareable not null,
  target_id   uuid not null,
  primary key (file_id, target_type, target_id)
);

-- ---------------------------------------------------------------- google --

create table google_accounts (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references profiles on delete cascade,
  google_sub    text not null unique,
  email         text not null,
  refresh_token text not null,
  scopes        text[] not null default '{}',
  last_sync_at  timestamptz,
  sync_error    text,
  created_at    timestamptz not null default now(),
  unique (profile_id, google_sub)
);

create table google_calendars (
  id                uuid primary key default gen_random_uuid(),
  google_account_id uuid not null references google_accounts on delete cascade,
  calendar_id       text not null,
  summary           text not null,
  access_role       text not null,
  is_selected       boolean not null default false,
  direction         sync_direction not null default 'import_only',
  sync_token        text,
  created_at        timestamptz not null default now(),
  unique (google_account_id, calendar_id),
  -- A calendar Google only lets us read must never be an export target.
  constraint no_export_to_readonly
    check (access_role <> 'reader' or direction = 'import_only')
);

-- The table that makes two-way sync safe. Unique in BOTH directions, so a
-- sync echo collides with an existing row instead of creating a second event.
create table google_event_map (
  id                  uuid primary key default gen_random_uuid(),
  google_calendar_ref uuid not null references google_calendars on delete cascade,
  google_event_id     text not null,
  event_id            uuid not null references events on delete cascade,
  etag                text,
  remote_updated_at   timestamptz,
  local_updated_at    timestamptz,
  last_synced_at      timestamptz,
  unique (google_calendar_ref, google_event_id),
  unique (event_id, google_calendar_ref)
);

-- --------------------------------------------------------- notifications --

create table notification_preferences (
  profile_id      uuid primary key references profiles on delete cascade,
  channels        notify_channel[] not null default '{email}',
  digest_daily    boolean not null default false,
  digest_daily_at time    not null default '07:00',
  digest_weekly   boolean not null default false,
  quiet_start     time,
  quiet_end       time,
  updated_at      timestamptz not null default now()
);
create trigger notification_preferences_touch before update on notification_preferences
  for each row execute function set_updated_at();

create table notification_category_prefs (
  profile_id      uuid not null references profiles on delete cascade,
  category_id     uuid not null references event_categories on delete cascade,
  enabled         boolean not null default true,
  offsets_minutes int[]   not null default '{1440}',
  primary key (profile_id, category_id)
);

create table push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

-- Dormant until SMS is funded. Consent is captured from day one so it is
-- never retrofitted onto numbers collected without it.
create table phone_numbers (
  profile_id        uuid primary key references profiles on delete cascade,
  e164              text not null check (e164 ~ '^\+[1-9][0-9]{7,14}$'),
  verified_at       timestamptz,
  consent_at        timestamptz,
  verification_hash text,
  created_at        timestamptz not null default now()
);

create table notification_queue (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references profiles on delete cascade,
  subject_type   text not null check (subject_type in ('event','assignment','task','digest')),
  subject_id     uuid not null,
  channel        notify_channel not null,
  offset_minutes int not null,
  scheduled_for  timestamptz not null,
  state          notify_state not null default 'pending',
  attempts       smallint not null default 0,
  sent_at        timestamptz,
  error          text,
  created_at     timestamptz not null default now(),

  -- This is what makes a duplicate reminder impossible rather than unlikely.
  -- A retried, overlapping or double-fired cron cannot insert a second
  -- identical row; the database refuses it.
  unique (profile_id, subject_type, subject_id, channel, offset_minutes)
);
create index notification_due_idx on notification_queue (scheduled_for)
  where state = 'pending';

create table notification_deliveries (
  id          uuid primary key default gen_random_uuid(),
  queue_id    uuid references notification_queue on delete set null,
  profile_id  uuid not null references profiles on delete cascade,
  channel     notify_channel not null,
  subject     text,
  delivered_at timestamptz not null default now(),
  provider_id text
);
create index notification_deliveries_idx on notification_deliveries (profile_id, delivered_at desc);

-- ===========================================================================
-- 20260904000200_rls.sql
-- ===========================================================================

-- ============================================================================
-- Calenda -- row-level security
--
-- This file is the permission boundary. Nothing in the UI is trusted; a user
-- who crafts their own request against the API gets exactly what these
-- policies allow and nothing more.
--
-- Three properties are asserted by tests in src/test/rls.test.ts:
--   1. A parent link alone grants no access.
--   2. An admin has no read path to private content.
--   3. A normal user cannot approve their own community suggestion.
-- ============================================================================

-- ------------------------------------------------------------- helpers ----
-- security definer so a policy can consult tables the caller cannot read
-- (e.g. checking a parent link without granting read access to all links).

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function is_linked_parent_of(student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from parent_links
    where parent_id = auth.uid()
      and student_id = student
      and status = 'accepted'
  );
$$;

create or replace function has_share(rt shareable, rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from shares
    where grantee_id = auth.uid()
      and resource_type = rt
      and resource_id = rid
  );
$$;

-- Owner of the class a nested resource belongs to.
create or replace function class_owner(cid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select owner_id from classes where id = cid;
$$;

-- --------------------------------------------------- role escalation ------
-- RLS cannot restrict individual columns, so the role column is protected two
-- ways: it is not granted to clients, and a trigger rejects any change that
-- did not come from an admin. Belt and braces, because a mistake here is the
-- whole system.

create or replace function guard_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null for the service role, a migration, and the Supabase SQL
  -- editor. Those are the only ways to bootstrap the very first admin, so they
  -- are allowed through -- there is no admin yet to authorise it.
  --
  -- This does not open a hole for anonymous clients: they also have a null
  -- uid, but the profiles_update policy requires id = auth.uid() or is_admin(),
  -- so their UPDATE matches no rows and never reaches this trigger.
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not is_admin() then
    raise exception 'role may not be changed';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_role before update on profiles
  for each row execute function guard_profile_role();

-- ------------------------------------------------------------- enable -----

alter table profiles                   enable row level security;
alter table parent_links               enable row level security;
alter table shares                     enable row level security;
alter table school_years               enable row level security;
alter table event_categories           enable row level security;
alter table event_series               enable row level security;
alter table events                     enable row level security;
alter table event_reviews              enable row level security;
alter table import_batches             enable row level security;
alter table import_staging             enable row level security;
alter table classes                    enable row level security;
alter table notebook_pages             enable row level security;
alter table assignments                enable row level security;
alter table tasks                      enable row level security;
alter table files                      enable row level security;
alter table file_links                 enable row level security;
alter table google_accounts            enable row level security;
alter table google_calendars           enable row level security;
alter table google_event_map           enable row level security;
alter table notification_preferences   enable row level security;
alter table notification_category_prefs enable row level security;
alter table push_subscriptions         enable row level security;
alter table phone_numbers              enable row level security;
alter table notification_queue         enable row level security;
alter table notification_deliveries    enable row level security;

-- ------------------------------------------------------------ profiles ----

create policy profiles_select on profiles for select using (
     id = auth.uid()
  or is_admin()
  -- A parent may see the profile of a student who accepted their link, and a
  -- student may see the profile of a parent they accepted. Nothing wider.
  or is_linked_parent_of(id)
  or exists (
       select 1 from parent_links
       where student_id = auth.uid() and parent_id = profiles.id and status = 'accepted'
     )
);

create policy profiles_update on profiles for update
  using (id = auth.uid() or is_admin())
  with check (id = auth.uid() or is_admin());

-- -------------------------------------------------------- parent links ----

create policy parent_links_select on parent_links for select using (
  parent_id = auth.uid() or student_id = auth.uid() or is_admin()
);

-- Either side may propose a link; neither side may accept on the other's
-- behalf -- see the update policy.
create policy parent_links_insert on parent_links for insert with check (
  parent_id = auth.uid() or student_id = auth.uid()
);

create policy parent_links_update on parent_links for update
  using (parent_id = auth.uid() or student_id = auth.uid())
  with check (parent_id = auth.uid() or student_id = auth.uid());

create policy parent_links_delete on parent_links for delete using (
  parent_id = auth.uid() or student_id = auth.uid()
);

-- -------------------------------------------------------------- shares ----

create policy shares_select on shares for select using (
  grantee_id = auth.uid() or granted_by = auth.uid()
);
create policy shares_insert on shares for insert with check (granted_by = auth.uid());
create policy shares_delete on shares for delete using (granted_by = auth.uid());

-- ------------------------------------------------- reference tables -------
-- School years and categories are common vocabulary: readable by everyone
-- signed in, writable only by an admin.

create policy school_years_select on school_years for select using (auth.uid() is not null);
create policy school_years_write  on school_years for all
  using (is_admin()) with check (is_admin());

create policy categories_select on event_categories for select using (auth.uid() is not null);
create policy categories_write  on event_categories for all
  using (is_admin()) with check (is_admin());

create policy series_select on event_series for select using (auth.uid() is not null);
create policy series_write  on event_series for all
  using (is_admin()) with check (is_admin());

-- -------------------------------------------------------------- events ----

create policy events_select on events for select using (
     owner_id = auth.uid()
  or (visibility = 'community' and status = 'approved')
  -- (1) a parent link alone is not enough; the row must also be shared
  or (shared_with_parents and is_linked_parent_of(owner_id))
  or has_share('event', id)
  -- (2) admin reach stops at community content
  or (is_admin() and visibility = 'community')
);

create policy events_insert on events for insert with check (
  owner_id = auth.uid()
  and (
       visibility = 'private'                          -- private: no approval
    or (visibility = 'community' and status = 'pending') -- (3) suggest only
    or is_admin()                                        -- admins may publish
  )
);

create policy events_update on events for update
  using (
       (owner_id = auth.uid() and status <> 'approved')
    or (owner_id = auth.uid() and visibility = 'private')
    or (is_admin() and visibility = 'community')
  )
  with check (
       (owner_id = auth.uid() and visibility = 'private')
    or (owner_id = auth.uid() and visibility = 'community' and status = 'pending')
    or (is_admin() and visibility = 'community')
  );

create policy events_delete on events for delete using (
  owner_id = auth.uid() or (is_admin() and visibility = 'community')
);

create policy event_reviews_select on event_reviews for select using (
  is_admin() or exists (
    select 1 from events e where e.id = event_reviews.event_id and e.owner_id = auth.uid()
  )
);
create policy event_reviews_insert on event_reviews for insert
  with check (is_admin() and reviewer_id = auth.uid());

-- Imports are an admin operation end to end.
create policy import_batches_all on import_batches for all
  using (is_admin()) with check (is_admin() and admin_id = auth.uid());
create policy import_staging_all on import_staging for all
  using (is_admin()) with check (is_admin());

-- ------------------------------------------------------------- classes ----

create policy classes_select on classes for select using (
     owner_id = auth.uid()
  or (shared_with_parents and is_linked_parent_of(owner_id))
  or has_share('class', id)
);
create policy classes_insert on classes for insert with check (owner_id = auth.uid());
create policy classes_update on classes for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy classes_delete on classes for delete using (owner_id = auth.uid());

-- Nested resources repeat the same shape. A parent who can see a class still
-- cannot see a private page inside it -- each row carries its own flag.

create policy notebook_select on notebook_pages for select using (
     owner_id = auth.uid()
  or (shared_with_parents and is_linked_parent_of(owner_id))
  or has_share('notebook_page', id)
);
create policy notebook_insert on notebook_pages for insert
  with check (owner_id = auth.uid() and class_owner(class_id) = auth.uid());
create policy notebook_update on notebook_pages for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy notebook_delete on notebook_pages for delete using (owner_id = auth.uid());

create policy assignments_select on assignments for select using (
     owner_id = auth.uid()
  or (shared_with_parents and is_linked_parent_of(owner_id))
  or has_share('assignment', id)
);
create policy assignments_insert on assignments for insert
  with check (owner_id = auth.uid() and class_owner(class_id) = auth.uid());
create policy assignments_update on assignments for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy assignments_delete on assignments for delete using (owner_id = auth.uid());

create policy tasks_select on tasks for select using (
  owner_id = auth.uid() or has_share('task', id)
);
create policy tasks_insert on tasks for insert with check (owner_id = auth.uid());
create policy tasks_update on tasks for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy tasks_delete on tasks for delete using (owner_id = auth.uid());

create policy files_select on files for select using (
     owner_id = auth.uid()
  or (shared_with_parents and is_linked_parent_of(owner_id))
  or has_share('file', id)
);
create policy files_insert on files for insert
  with check (owner_id = auth.uid() and class_owner(class_id) = auth.uid());
create policy files_update on files for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy files_delete on files for delete using (owner_id = auth.uid());

create policy file_links_all on file_links for all using (
  exists (select 1 from files f where f.id = file_links.file_id and f.owner_id = auth.uid())
) with check (
  exists (select 1 from files f where f.id = file_links.file_id and f.owner_id = auth.uid())
);

-- -------------------------------------------------------------- google ----
-- Strictly private. A refresh token is never readable by anyone but its owner,
-- and not by an admin either.

create policy google_accounts_all on google_accounts for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy google_calendars_all on google_calendars for all
  using (exists (
    select 1 from google_accounts a
    where a.id = google_calendars.google_account_id and a.profile_id = auth.uid()))
  with check (exists (
    select 1 from google_accounts a
    where a.id = google_calendars.google_account_id and a.profile_id = auth.uid()));

create policy google_map_all on google_event_map for all
  using (exists (select 1 from events e where e.id = google_event_map.event_id
                 and e.owner_id = auth.uid()))
  with check (exists (select 1 from events e where e.id = google_event_map.event_id
                 and e.owner_id = auth.uid()));

-- ------------------------------------------------------- notifications ----

create policy notif_prefs_all on notification_preferences for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy notif_cat_prefs_all on notification_category_prefs for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy push_subs_all on push_subscriptions for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy phone_numbers_all on phone_numbers for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- The queue is written by the dispatcher (service role, which bypasses RLS).
-- Users may read their own history but never forge a delivery.
create policy notif_queue_select on notification_queue for select
  using (profile_id = auth.uid());
create policy notif_deliveries_select on notification_deliveries for select
  using (profile_id = auth.uid());

-- ------------------------------------------------------- column grants ----
-- The role column is deliberately absent from this grant, so a client cannot
-- name it in an update even before the trigger runs.

revoke update on profiles from authenticated;
grant  update (full_name, avatar_url, grade, timezone, onboarded_at)
  on profiles to authenticated;

-- ------------------------------------------------------- search view ------
-- security_invoker means the view runs as the caller, so it inherits every
-- policy above. Search can never surface a row the user could not open.

create view search_index with (security_invoker = true) as
  select 'event'::text as kind, e.id, e.owner_id, e.title,
         left(coalesce(e.description, ''), 200) as snippet,
         e.search_vector, e.updated_at, null::uuid as class_id
    from events e
  union all
  select 'notebook_page', p.id, p.owner_id, p.title,
         left(p.content_text, 200), p.search_vector, p.updated_at, p.class_id
    from notebook_pages p
  union all
  select 'assignment', a.id, a.owner_id, a.title,
         left(coalesce(a.description, ''), 200),
         to_tsvector('english', coalesce(a.title,'') || ' ' || coalesce(a.description,'')),
         a.updated_at, a.class_id
    from assignments a
  union all
  select 'task', t.id, t.owner_id, t.title,
         left(coalesce(t.notes, ''), 200),
         to_tsvector('english', coalesce(t.title,'') || ' ' || coalesce(t.notes,'')),
         t.updated_at, t.class_id
    from tasks t;

-- ===========================================================================
-- 20260904000300_seed.sql
-- ===========================================================================

-- ============================================================================
-- Calenda -- reference data
-- Categories and the current school year. Safe to re-run.
-- ============================================================================

insert into event_categories (slug, name, color_token, icon, sort_order, is_system) values
  ('academic',    'Academic',       'cat-academic',    'graduation-cap',  10, true),
  ('school',      'School',         'cat-school',      'school',          20, true),
  ('pa-day',      'PA Day',         'cat-pa-day',      'coffee',          30, true),
  ('holiday',     'Holiday',        'cat-holiday',     'palmtree',        40, true),
  ('exam',        'Exam',           'cat-exam',        'file-check',      50, true),
  ('assignment',  'Assignment',     'cat-assignment',  'clipboard-list',  60, true),
  ('sports',      'Sports',         'cat-sports',      'trophy',          70, true),
  ('clubs',       'Clubs',          'cat-clubs',       'users',           80, true),
  ('trips',       'Trips',          'cat-trips',       'map',             90, true),
  ('performance', 'Performance',    'cat-performance', 'music',          100, true),
  ('family',      'Parent/Family',  'cat-family',      'home',           110, true),
  ('personal',    'Personal',       'cat-personal',    'user',           120, true),
  ('other',       'Other',          'cat-other',       'circle',         130, true)
on conflict (slug) do nothing;

-- Dates taken from the 2026-27 Important Dates PDF: first student day is
-- 8 September 2026 and the last staff day is 30 June 2027.
insert into school_years (label, starts_on, ends_on, is_current) values
  ('2026–27', '2026-09-01', '2027-06-30', true)
on conflict (label) do nothing;

-- ===========================================================================
-- 20260904000400_parent_invites.sql
-- ===========================================================================

-- ============================================================================
-- Parent invites
--
-- Connecting a parent needs one side to find the other, but RLS deliberately
-- stops anyone reading another person's profile -- so neither side can look
-- the other up by email. A short-lived code solves it without weakening that:
-- the student generates one, the parent redeems it.
--
-- Redemption runs through a security-definer function rather than direct
-- table access, so a parent never gains read access to the invites table and
-- cannot enumerate codes.
-- ============================================================================

create table parent_invites (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references profiles on delete cascade,
  code        text not null unique,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '7 days'),
  used_at     timestamptz,
  used_by     uuid references profiles on delete set null
);

create index parent_invites_student_idx on parent_invites (student_id, created_at desc);
-- Redemption looks a code up directly; only unused, unexpired ones matter.
create index parent_invites_open_idx on parent_invites (code) where used_at is null;

alter table parent_invites enable row level security;

-- A student manages their own invites. Nobody reads anyone else's -- including
-- the parent redeeming one, who goes through the function below instead.
create policy parent_invites_own on parent_invites for all
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

/**
 * Generates a code the student can pass to a parent.
 *
 * Codes are 8 characters from an alphabet with no 0/O/1/I, so they can be read
 * aloud or typed from a screenshot without ambiguity.
 */
create or replace function create_parent_invite()
returns text
language plpgsql security definer set search_path = public as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  new_code text;
  attempt  int := 0;
begin
  if auth.uid() is null then
    raise exception 'You need to be signed in.';
  end if;

  -- Rate limit: a handful of open invites is plenty, and this stops a loop
  -- filling the table.
  if (select count(*) from parent_invites
      where student_id = auth.uid() and used_at is null and expires_at > now()) >= 5 then
    raise exception 'You already have several unused invite codes.';
  end if;

  loop
    attempt := attempt + 1;
    new_code := '';
    for _ in 1..8 loop
      new_code := new_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;

    begin
      insert into parent_invites (student_id, code) values (auth.uid(), new_code);
      return new_code;
    exception when unique_violation then
      -- Astronomically unlikely; retry rather than fail.
      if attempt > 8 then raise exception 'Could not create an invite code.'; end if;
    end;
  end loop;
end;
$$;

/**
 * Redeems a code, linking the caller as a parent of the student who made it.
 *
 * Runs as the definer so the caller never needs read access to parent_invites.
 * Every failure returns the SAME message, so a wrong code cannot be told apart
 * from an expired or already-used one -- otherwise this becomes an oracle for
 * guessing codes.
 */
create or replace function redeem_parent_invite(invite_code text)
-- The OUT names are prefixed because plpgsql resolves bare `student_id`
-- to the output variable, which makes the ON CONFLICT column list below
-- ambiguous and fails at runtime.
returns table (out_student_id uuid, out_student_name text)
language plpgsql security definer set search_path = public as $$
declare
  invite parent_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'You need to be signed in.';
  end if;

  select * into invite
  from parent_invites
  where code = upper(trim(invite_code))
    and used_at is null
    and expires_at > now()
  for update;

  if not found then
    raise exception 'That code is not valid. Ask for a new one.';
  end if;

  if invite.student_id = auth.uid() then
    raise exception 'That code is not valid. Ask for a new one.';
  end if;

  insert into parent_links (parent_id, student_id, status, accepted_at)
  values (auth.uid(), invite.student_id, 'accepted', now())
  on conflict (parent_id, student_id)
  do update set status = 'accepted', accepted_at = now();

  update parent_invites
     set used_at = now(), used_by = auth.uid()
   where id = invite.id;

  -- The parent is now linked, so reading this profile is permitted.
  return query
    select p.id, p.full_name
    from profiles p
    where p.id = invite.student_id;
end;
$$;

revoke all on function create_parent_invite() from public;
revoke all on function redeem_parent_invite(text) from public;
grant execute on function create_parent_invite() to authenticated;
grant execute on function redeem_parent_invite(text) to authenticated;

-- ============================================================================
-- Mark these migrations as applied, so the GitHub integration skips them.
-- ============================================================================

insert into supabase_migrations.schema_migrations (version, name) values
  ('20260904000100', 'init'),
  ('20260904000200', 'rls'),
  ('20260904000300', 'seed'),
  ('20260904000400', 'parent_invites')
on conflict (version) do nothing;

-- ============================================================================
-- Nothing above is saved until this commits.
-- ============================================================================

commit;
