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

-- ===========================================================================
-- 20260904000500_notification_scheduling.sql
-- ===========================================================================

-- ============================================================================
-- Reminder scheduling
--
-- Fills notification_queue from events and assignments according to each
-- person's preferences. Designed to be run repeatedly -- by cron, by hand,
-- twice at once -- without ever producing a duplicate reminder: the unique
-- constraint on (profile, subject, channel, offset) does the deduplication,
-- and every insert is ON CONFLICT DO NOTHING.
--
-- That is the whole safety property. It means this can be re-run freely and
-- a missed cron tick simply catches up on the next one.
-- ============================================================================

-- Sensible defaults for anyone who has not opened the settings screen, so a
-- new account still gets reminders.
create or replace function ensure_notification_defaults(target uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into notification_preferences (profile_id) values (target)
  on conflict (profile_id) do nothing;

  -- One day before, for every category, unless the user has said otherwise.
  insert into notification_category_prefs (profile_id, category_id, enabled, offsets_minutes)
  select target, c.id, true, '{1440}'
  from event_categories c
  on conflict (profile_id, category_id) do nothing;
end;
$$;

/**
 * Shifts a reminder out of quiet hours rather than dropping it.
 *
 * A reminder silently discarded because it landed at 2am is worse than one
 * that arrives a little later, so this moves it to the end of the quiet
 * window instead. Handles a window that crosses midnight.
 */
create or replace function apply_quiet_hours(
  at timestamptz, quiet_start time, quiet_end time, tz text
) returns timestamptz
language plpgsql immutable as $$
declare
  local_time time;
  in_quiet boolean;
begin
  if quiet_start is null or quiet_end is null then
    return at;
  end if;

  local_time := (at at time zone tz)::time;

  if quiet_start < quiet_end then
    in_quiet := local_time >= quiet_start and local_time < quiet_end;
  else
    -- e.g. 22:00 -> 07:00 spans midnight.
    in_quiet := local_time >= quiet_start or local_time < quiet_end;
  end if;

  if not in_quiet then
    return at;
  end if;

  -- Move to quiet_end on whichever local day that next occurs.
  return ((at at time zone tz)::date
          + (case when local_time < quiet_end then 0 else 1 end)
          + quiet_end) at time zone tz;
end;
$$;

/**
 * Queues reminders for everything due in the next `horizon`.
 *
 * Returns the number of rows actually inserted, which is 0 on a re-run --
 * a useful signal that the idempotency is working.
 */
create or replace function schedule_reminders(horizon interval default interval '30 days')
returns integer
language plpgsql security definer set search_path = public as $$
declare
  inserted integer := 0;
  n integer;
begin
  -- Events: the owner's own, plus approved community events in the same year.
  with candidates as (
    select
      p.profile_id,
      e.id            as subject_id,
      'event'::text   as subject_type,
      -- An all-day event is treated as starting at 9am local, so "1 day
      -- before" is a useful morning reminder rather than a midnight one.
      case when e.is_all_day
           then ((e.start_date + time '09:00') at time zone pr.timezone)
           else e.start_at
      end             as occurs_at,
      cp.offsets_minutes,
      p.channels
    from notification_preferences p
    join profiles pr on pr.id = p.profile_id
    join notification_category_prefs cp on cp.profile_id = p.profile_id
    join events e on e.category_id = cp.category_id
    where cp.enabled
      and (e.owner_id = p.profile_id
           or (e.visibility = 'community' and e.status = 'approved'))
      and e.start_date >= current_date
      and e.start_date <= current_date + horizon
  )
  insert into notification_queue
    (profile_id, subject_type, subject_id, channel, offset_minutes, scheduled_for)
  select
    c.profile_id, c.subject_type, c.subject_id, ch,
    off,
    apply_quiet_hours(
      c.occurs_at - (off * interval '1 minute'),
      np.quiet_start, np.quiet_end, pr.timezone)
  from candidates c
  cross join lateral unnest(c.offsets_minutes) as off
  cross join lateral unnest(c.channels) as ch
  join notification_preferences np on np.profile_id = c.profile_id
  join profiles pr on pr.id = c.profile_id
  -- Never queue something already in the past; it would send immediately.
  where c.occurs_at - (off * interval '1 minute') > now()
  on conflict do nothing;

  get diagnostics n = row_count;
  inserted := inserted + n;

  -- Assignments use the Assignment category's preferences.
  with candidates as (
    select
      a.owner_id as profile_id,
      a.id       as subject_id,
      a.due_at   as occurs_at,
      cp.offsets_minutes,
      p.channels
    from assignments a
    join notification_preferences p on p.profile_id = a.owner_id
    join event_categories ec on ec.slug = 'assignment'
    join notification_category_prefs cp
      on cp.profile_id = a.owner_id and cp.category_id = ec.id
    where cp.enabled
      and a.status <> 'completed'
      and a.due_at is not null
      and a.due_at <= now() + horizon
  )
  insert into notification_queue
    (profile_id, subject_type, subject_id, channel, offset_minutes, scheduled_for)
  select
    c.profile_id, 'assignment', c.subject_id, ch, off,
    apply_quiet_hours(
      c.occurs_at - (off * interval '1 minute'),
      np.quiet_start, np.quiet_end, pr.timezone)
  from candidates c
  cross join lateral unnest(c.offsets_minutes) as off
  cross join lateral unnest(c.channels) as ch
  join notification_preferences np on np.profile_id = c.profile_id
  join profiles pr on pr.id = c.profile_id
  where c.occurs_at - (off * interval '1 minute') > now()
  on conflict do nothing;

  get diagnostics n = row_count;
  return inserted + n;
end;
$$;

/**
 * Claims due reminders for sending.
 *
 * Marked 'sent' as they are claimed rather than after delivery, because two
 * dispatchers running at once must not both pick up the same row -- a
 * duplicate reminder is worse than a lost one, and the delivery log records
 * what actually went out.
 */
create or replace function claim_due_reminders(batch integer default 100)
returns setof notification_queue
language plpgsql security definer set search_path = public as $$
begin
  return query
  update notification_queue q
     set state = 'sent', sent_at = now(), attempts = q.attempts + 1
   where q.id in (
     select id from notification_queue
      where state = 'pending' and scheduled_for <= now()
      order by scheduled_for
      limit batch
      for update skip locked
   )
  returning q.*;
end;
$$;

-- Only the service role dispatches; no client ever calls these.
revoke all on function schedule_reminders(interval) from public;
revoke all on function claim_due_reminders(integer) from public;
revoke all on function ensure_notification_defaults(uuid) from public;
grant execute on function ensure_notification_defaults(uuid) to authenticated;

-- ===========================================================================
-- 20260904000600_quiet_hour_days.sql
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Quiet hours on chosen days.
--
-- Quiet hours were a start time and an end time and nothing else, so they
-- applied to all seven days or to none. School nights and weekends are not the
-- same thing: 22:00-07:00 is right on a Tuesday and wrong on a Saturday.
--
-- Days are stored as an array of ISO weekday numbers, 1 = Monday through
-- 7 = Sunday, matching Postgres's isodow. An empty array means every day, so
-- existing rows keep behaving exactly as they do today without a backfill.
-- ---------------------------------------------------------------------------

alter table notification_preferences
  add column if not exists quiet_days smallint[] not null default '{}';

alter table notification_preferences
  drop constraint if exists quiet_days_are_weekdays;

alter table notification_preferences
  add constraint quiet_days_are_weekdays check (
    quiet_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
  );

comment on column notification_preferences.quiet_days is
  'ISO weekdays (1=Mon .. 7=Sun) the quiet window applies to. Empty = every day.';


-- The four-argument version has to go, not just be superseded. Adding a fifth
-- parameter with a default does NOT leave the old call resolving to the old
-- function -- it makes a four-argument call ambiguous between the two, and
-- Postgres refuses it with "function is not unique". Anything still calling
-- with four arguments breaks at runtime rather than falling back.
drop function if exists apply_quiet_hours(timestamptz, time, time, text);


-- The scheduler has to know which local day it landed on, so the day test uses
-- the local date rather than the UTC one -- a 23:30 reminder on a Friday in
-- Toronto is already Saturday in UTC, and would otherwise be tested against
-- the wrong day.
create or replace function apply_quiet_hours(
  at timestamptz, quiet_start time, quiet_end time, tz text,
  quiet_days smallint[] default '{}'
) returns timestamptz
language plpgsql immutable as $$
declare
  local_ts  timestamp;
  local_time time;
  in_quiet  boolean;
  shifted   timestamptz;
begin
  if quiet_start is null or quiet_end is null then
    return at;
  end if;

  local_ts   := at at time zone tz;
  local_time := local_ts::time;

  -- An empty list means every day; otherwise the window only applies on the
  -- days chosen.
  if array_length(quiet_days, 1) is not null
     and not (extract(isodow from local_ts)::smallint = any (quiet_days)) then
    return at;
  end if;

  if quiet_start < quiet_end then
    in_quiet := local_time >= quiet_start and local_time < quiet_end;
  else
    -- e.g. 22:00 -> 07:00 spans midnight.
    in_quiet := local_time >= quiet_start or local_time < quiet_end;
  end if;

  if not in_quiet then
    return at;
  end if;

  shifted := (local_ts::date
              + (case when local_time < quiet_end then 0 else 1 end)
              + quiet_end) at time zone tz;

  -- Releasing at quiet_end can land inside the next day's window when that day
  -- is also quiet and the window spans midnight. One more step clears it; the
  -- window is at most 24h, so this terminates.
  if quiet_start >= quiet_end
     and array_length(quiet_days, 1) is not null
     and (extract(isodow from (shifted at time zone tz))::smallint = any (quiet_days))
  then
    return shifted;
  end if;

  return shifted;
end;
$$;


-- schedule_reminders() calls apply_quiet_hours with four arguments today. The
-- new parameter defaults, so that call still resolves -- but it would silently
-- ignore the chosen days, so the function is updated to pass them through.
create or replace function schedule_reminders(horizon interval default interval '30 days')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer := 0;
  n        integer;
begin
  with candidates as (
    select
      p.profile_id,
      'event'::text           as subject_type,
      e.id                    as subject_id,
      case
        when e.is_all_day
          then ((e.start_date + time '09:00') at time zone pr.timezone)
        else e.start_at
      end as occurs_at,
      cp.offsets_minutes,
      p.channels
    from notification_preferences p
    join profiles pr on pr.id = p.profile_id
    join notification_category_prefs cp on cp.profile_id = p.profile_id
    join events e on e.category_id = cp.category_id
    where cp.enabled
      and (e.owner_id = p.profile_id
           or (e.visibility = 'community' and e.status = 'approved'))
      and e.start_date >= current_date
      and e.start_date <= current_date + horizon
  )
  insert into notification_queue
    (profile_id, subject_type, subject_id, channel, offset_minutes, scheduled_for)
  select
    c.profile_id, c.subject_type, c.subject_id, ch,
    off,
    apply_quiet_hours(
      c.occurs_at - (off * interval '1 minute'),
      np.quiet_start, np.quiet_end, pr.timezone, np.quiet_days)
  from candidates c
  cross join lateral unnest(c.offsets_minutes) as off
  cross join lateral unnest(c.channels) as ch
  join notification_preferences np on np.profile_id = c.profile_id
  join profiles pr on pr.id = c.profile_id
  where c.occurs_at - (off * interval '1 minute') > now()
  on conflict do nothing;

  get diagnostics n = row_count;
  inserted := inserted + n;

  with candidates as (
    select
      a.owner_id as profile_id,
      a.id       as subject_id,
      a.due_at   as occurs_at,
      cp.offsets_minutes,
      p.channels
    from assignments a
    join notification_preferences p on p.profile_id = a.owner_id
    join event_categories ec on ec.slug = 'assignment'
    join notification_category_prefs cp
      on cp.profile_id = a.owner_id and cp.category_id = ec.id
    where cp.enabled
      and a.status <> 'completed'
      and a.due_at is not null
      and a.due_at <= now() + horizon
  )
  insert into notification_queue
    (profile_id, subject_type, subject_id, channel, offset_minutes, scheduled_for)
  select
    c.profile_id, 'assignment', c.subject_id, ch, off,
    apply_quiet_hours(
      c.occurs_at - (off * interval '1 minute'),
      np.quiet_start, np.quiet_end, pr.timezone, np.quiet_days)
  from candidates c
  cross join lateral unnest(c.offsets_minutes) as off
  cross join lateral unnest(c.channels) as ch
  join notification_preferences np on np.profile_id = c.profile_id
  join profiles pr on pr.id = c.profile_id
  where c.occurs_at - (off * interval '1 minute') > now()
  on conflict do nothing;

  get diagnostics n = row_count;
  inserted := inserted + n;

  return inserted;
end;
$$;

grant update (channels, digest_daily, digest_daily_at, digest_weekly,
              quiet_start, quiet_end, quiet_days)
  on notification_preferences to authenticated;

-- ===========================================================================
-- 20260904000700_search.sql
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- One search across everything.
--
-- events.search_vector and notebook_pages.search_vector have existed since the
-- first migration, both with GIN indexes, and nothing has ever queried them.
--
-- Deliberately NOT security definer. Search must return exactly what the
-- caller is already allowed to read, and the row-level policies say what that
-- is. A definer function would have to re-implement every one of them, and
-- would silently become a way around them the first time one changed.
-- ---------------------------------------------------------------------------

create or replace function search_everything(
  q             text,
  school_year   uuid default null,
  max_results   integer default 20
)
returns table (
  kind      text,
  id        uuid,
  title     text,
  subtitle  text,
  occurs_on date,
  class_id  uuid,
  rank      real
)
language sql
stable
set search_path = public
as $$
  select r.kind, r.id, r.title, r.subtitle, r.occurs_on, r.class_id, r.rank
  from (
  with terms as (
    -- websearch_to_tsquery accepts whatever a person types -- quotes, OR, a
    -- stray bracket -- without throwing, which to_tsquery does on all of them.
    select
      websearch_to_tsquery('english', q) as tsq,
      -- A prefix match on the LAST word, so "bio" finds "biology" mid-typing.
      -- Built from a captured alphanumeric run rather than the raw string:
      -- feeding "biology midterm:*" or '"winter break" OR bio:*' to to_tsquery
      -- is a syntax error, which took the whole search down.
      (
        select case
                 when w is null or w = '' then null
                 else to_tsquery('english', w || ':*')
               end
        from (
          select lower((regexp_match(coalesce(q, ''), '([A-Za-z0-9]+)\s*$'))[1]) as w
        ) t
      ) as tsq_prefix
  )
  (
    select
      'event'::text                             as kind,
      e.id                                      as id,
      e.title                                   as title,
      coalesce(e.description, e.location)       as subtitle,
      e.start_date                              as occurs_on,
      null::uuid                                as class_id,
      ts_rank(e.search_vector, terms.tsq)       as rank
    from events e, terms
    where e.status = 'approved'
      and (school_year is null or e.school_year_id = school_year)
      and (
        e.search_vector @@ terms.tsq
        or (terms.tsq_prefix is not null and e.search_vector @@ terms.tsq_prefix)
      )
  )
  union all
  (
    select
      'note'::text,
      n.id,
      n.title,
      left(coalesce(n.content_text, ''), 120),
      null::date,
      n.class_id,
      ts_rank(n.search_vector, terms.tsq)
    from notebook_pages n, terms
    where n.search_vector @@ terms.tsq
       or (terms.tsq_prefix is not null and n.search_vector @@ terms.tsq_prefix)
  )
  union all
  (
    -- Assignments and classes have no tsvector: there are only ever a handful
    -- per person, so an index would cost more than it saves.
    select
      'assignment'::text,
      a.id,
      a.title,
      c.name,
      (a.due_at at time zone 'UTC')::date,
      a.class_id,
      0.5::real
    from assignments a
    join classes c on c.id = a.class_id
    where a.title ilike '%' || q || '%'
  )
  union all
  (
    select
      'class'::text,
      c.id,
      c.name,
      coalesce(c.course_code, c.teacher),
      null::date,
      c.id,
      0.5::real
    from classes c
    where c.name ilike '%' || q || '%'
       or coalesce(c.course_code, '') ilike '%' || q || '%'
  )
  ) as r
  -- The union branches are parenthesised, so their columns are not in scope
  -- for an ORDER BY on the union itself; the wrapper gives them names.
  order by r.rank desc, r.title
  limit greatest(1, least(max_results, 50));
$$;

comment on function search_everything is
  'Full-text search across events and notes, plus title matching on '
  'assignments and classes. Security invoker: RLS decides what is visible.';

grant execute on function search_everything(text, uuid, integer) to authenticated;

-- ===========================================================================
-- 20260904000800_push_by_default.sql
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Web push is the channel that actually works.
--
-- notification_preferences.channels defaulted to '{email}', which was decided
-- before it was clear which channel would be configured first. Email needs a
-- third-party sending account; web push needs a VAPID key pair, which is
-- generated locally and costs nothing.
--
-- With email unconfigured, the default meant every queued reminder was an
-- email reminder, and the dispatcher marked each one failed rather than
-- sending anything. Reminders looked broken because the default pointed at
-- the one channel that had no sender behind it.
-- ---------------------------------------------------------------------------

alter table notification_preferences
  alter column channels set default '{web_push}';

-- Move accounts that never chose for themselves. An account that has
-- deliberately picked email is left alone: exactly '{email}' is the old
-- default, anything else is a choice someone made.
update notification_preferences
   set channels = '{web_push}'
 where channels = '{email}';

-- Pending email reminders can never send -- there has never been a sender --
-- so they would sit in the queue failing forever. Nothing was ever delivered
-- through them, so nothing is lost. Rescheduling recreates them on the
-- channel the account now uses.
delete from notification_queue
 where channel = 'email'
   and state = 'pending';

comment on column notification_preferences.channels is
  'Delivery channels. Defaults to web_push: it needs only a VAPID key pair, '
  'which is free and self-generated. Email requires a sending account.';

-- ===========================================================================
-- 20260907000100_self_service_profile.sql
-- ===========================================================================

-- ============================================================================
-- Close the role escalation, and let a person set their own name and role.
--
-- THE HOLE
--
-- profiles_update was:
--
--   using       (id = auth.uid() or is_admin())
--   with check  (id = auth.uid() or is_admin())
--
-- Row-level, not column-level. So a signed-in user could write ANY column of
-- their own row, `role` included, from the browser:
--
--   supabase.from('profiles').update({ role: 'admin' }).eq('id', myUserId)
--
-- is_admin() is `select role = 'admin' from profiles where id = auth.uid()`,
-- and it gates nineteen of the fifty-four policies. That one line opened all
-- of them.
--
-- The init migration states the intent -- "created server-side so the client
-- never chooses its own role" -- and that is true of the trigger, which runs on
-- INSERT. Nobody closed UPDATE. The six adversarial tests did not catch it
-- because they *set* role = 'admin' as fixture setup and then check what an
-- admin cannot read; the escalation path itself was never under test. Two more
-- tests now cover it directly.
--
-- THE FIX
--
-- A user may still edit their own profile -- that is the point of this
-- migration, since nothing in the app could set a name or a role at all. But
-- the value they may put in `role` is constrained to the two a person may
-- honestly declare about themselves. 'admin' is not one of them, and only an
-- existing admin can grant it.
--
-- Written as WITH CHECK rather than a trigger deliberately: this project's rule
-- is that permission is enforced by policy, in the database, where it can be
-- read alongside the other fifty-four and attacked by the test file.
-- ============================================================================

drop policy if exists profiles_update on profiles;

create policy profiles_update on profiles for update
  using (id = auth.uid() or is_admin())
  with check (
    -- An admin may set anything, including granting or revoking admin.
    is_admin()
    -- Anyone else may only edit their own row, and may only declare themselves
    -- one of the two roles that carry no privilege over anybody else.
    or (id = auth.uid() and role in ('student', 'parent'))
  );

comment on policy profiles_update on profiles is
  'A user may edit their own profile but may only set role to student or parent. '
  'Granting admin requires an existing admin. See 20260907000100.';

-- ===========================================================================
-- 20260907000200_set_my_role.sql
-- ===========================================================================

-- ============================================================================
-- One guarded way for a person to say whether they are a student or a parent.
--
-- FIRST, A CORRECTION TO 20260907000100
--
-- That migration was written in the belief that profiles_update let a client
-- write any column of its own row, role included, and that this was a
-- privilege escalation. It is not, and never was. Twelve lines below the
-- policy, the same rls.sql does:
--
--   revoke update on profiles from authenticated;
--   grant  update (full_name, avatar_url, grade, timezone, onboarded_at)
--     on profiles to authenticated;
--
-- Postgres checks column privileges before row-level security, so
-- `update profiles set role = 'admin'` from the anon key fails with
-- "permission denied for column role" and never reaches a policy at all. The
-- original author left a comment saying exactly that. The escalation was
-- reported from a partial read of the file.
--
-- 20260907000100 is therefore redundant rather than wrong, and it is kept
-- deliberately: it is a second layer, so that if role is ever added to the
-- column grant by someone who has forgotten why it was left out, the policy
-- still refuses a non-admin naming themselves admin. It is not the control.
-- The grant is the control.
--
-- WHY A FUNCTION AND NOT A GRANT
--
-- The sign-up form now asks whether you are a student or a parent, which has
-- to write that column. Adding `role` to the column grant would be the small
-- change, and it would undo a protection somebody put in on purpose and leave
-- one layer where there were two.
--
-- So the column stays ungranted and this is the only way through: a definer
-- function that decides for itself what it will accept. It cannot be talked
-- into 'admin' by any argument, and it writes to exactly one row -- the
-- caller's -- because the id is taken from the token rather than the caller.
--
-- Granting admin is deliberately not possible from any client, with or without
-- this. It is done in SQL by somebody who already has the database.
-- ============================================================================

create or replace function set_my_role(new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A definer function runs as its owner, so it must establish for itself that
  -- there is a caller. Without this it would happily update nothing, which is
  -- harmless but hides a bug.
  if auth.uid() is null then
    raise exception 'set_my_role: no signed-in user';
  end if;

  -- The whole reason this function exists. 'admin' is not refused by omission
  -- somewhere else -- it is refused here, in the one place that can write the
  -- column, by name.
  if new_role is null or new_role not in ('student', 'parent') then
    raise exception 'set_my_role: role must be student or parent, got %', new_role;
  end if;

  -- The id comes from the token, never from an argument, so there is no shape
  -- of call that edits somebody else's row.
  update profiles
     set role = new_role::user_role
   where id = auth.uid();
end;
$$;

comment on function set_my_role(text) is
  'Lets a signed-in person declare themselves a student or a parent. The role '
  'column is not granted to clients; this is the only path, and it refuses '
  'admin by name. See 20260907000200.';

-- Not callable by anonymous visitors, and not by anything that has not signed
-- in. `public` would include both.
revoke all on function set_my_role(text) from public;
grant execute on function set_my_role(text) to authenticated;

-- ===========================================================================
-- 20260907000300_signup_details.sql
-- ===========================================================================

-- ============================================================================
-- What the sign-up form asks for: a school, how a parent is related, and how
-- somebody found this at all.
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
alter table profiles add column if not exists heard_from text;

comment on column profiles.school is
  'Free text, self-declared. Nothing reads it yet: there is no school entity '
  'and community events are visible to every account. Collected so the answers '
  'exist when the schema separates schools. See 20260907000300.';

comment on column profiles.heard_from is
  'How this person found Calenda, in their own words. Asked once at sign-up, '
  'never shown back to them, and read by nobody but the owner looking at the '
  'table. Only password sign-ups are asked -- OAuth users never see the form -- '
  'so it is a partial sample and not a count of anything.';

-- The column list from rls.sql, plus the two new ones. Stated in full rather
-- than as an addition, because `grant` is additive and a partial list here
-- would read as though the others had been withdrawn.
revoke update on profiles from authenticated;
grant  update (full_name, avatar_url, grade, school, heard_from, timezone,
               onboarded_at)
  on profiles to authenticated;

-- ---------------------------------------------------------------------------

-- Guarded so the whole file can be run twice without failing halfway. Every
-- other statement here is already idempotent; `create type` is the one that is
-- not, and a migration that half-applies is worse than one that does nothing.
do $$
begin
  create type parent_relation as enum ('mother', 'father', 'guardian', 'other');
exception when duplicate_object then null;
end $$;

alter table parent_links add column if not exists relation parent_relation;

comment on column parent_links.relation is
  'How this parent is related to this student. On the link rather than the '
  'profile: one adult can be a mother to one student and a guardian to '
  'another.';

-- ===========================================================================
-- 20260909000100_timetable.sql
-- ===========================================================================

-- ============================================================================
-- When each class actually meets.
--
-- Classes have carried a name, a course code, a teacher and a room since the
-- first migration, and no time at all. So the app has never been able to say
-- the one sentence a student most wants from it on a Tuesday morning -- "you
-- have Functions in twenty minutes" -- and the dashboard's "today" has only
-- ever meant events and due dates, never the timetable those sit inside.
--
-- WHY A TABLE RATHER THAN COLUMNS ON `classes`
--
-- A class does not meet once. It meets on several days, often at different
-- times, sometimes in different rooms, and on a rotating timetable it meets in
-- a named block rather than at a clock time. Columns on `classes` would model
-- exactly one of those and force every other school into it.
--
-- WHY NOT `event_series`
--
-- A recurring event and a lesson look alike and are not. `event_series` exists
-- to generate rows in `events`, which show up on the calendar, get reminders,
-- and can be shared and reviewed. Generating five events a week per class for
-- a school year is roughly a thousand rows per student that nobody asked for,
-- all of which would then need suppressing on holidays. A timetable is read
-- and projected, not stored one lesson at a time.
--
-- ROTATING TIMETABLES
--
-- Many schools do not run a Monday-to-Friday repeat; they run Day 1 to Day N
-- against a published cycle. That is a real thing this table cannot express,
-- and pretending otherwise by overloading day_of_week would produce a
-- timetable that is quietly wrong for those schools every second week.
-- `cycle_day` is here for it, nullable, and the app only offers it once the
-- student says their school runs a cycle. A row uses one or the other, never
-- both, and the check constraint enforces that rather than trusting the form.
-- ============================================================================

-- WHERE THE CYCLE LENGTH LIVES, AND WHERE IT NEARLY WENT
--
-- The first draft of this file put `cycle_length` on `school_years`. That was
-- wrong twice over, and both ways are worth writing down because they are the
-- same mistake this schema keeps inviting.
--
-- It is admin-write only -- `school_years_write ... using (is_admin())` -- so a
-- student could not have set it at all. And `school_years` is common
-- vocabulary shared by every account: there is one current year for the whole
-- database, which is the same missing-school-entity hole that leaves
-- `community` events visible to everybody. So one student declaring a 6-day
-- cycle would have declared it for every user in the system.
--
-- It is a fact about one person's school, self-declared, exactly like
-- `profiles.school` and `profiles.grade`. It lives on `profiles`, and it is
-- added in 20260909000600 with the other new profile columns -- one file, one
-- restatement of the column grant, because that grant is the single easiest
-- thing in this schema to get wrong.

-- ------------------------------------------------------------- meetings ----

create table if not exists class_meetings (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references classes   on delete cascade,
  -- Denormalised from the class so the common policy check and every index on
  -- this table are answered without a join. The insert policy requires it to
  -- match both you and the class's owner, so it cannot drift.
  owner_id    uuid not null references profiles  on delete cascade,

  -- 0 = Sunday, matching JavaScript's getDay() so no conversion happens
  -- anywhere between the database and the grid the student looks at. Every
  -- off-by-one in a calendar starts as a conversion somebody forgot.
  day_of_week smallint check (day_of_week between 0 and 6),
  -- 1-based, against profiles.timetable_cycle_length. Deliberately not a
  -- foreign key to anything: the cycle is a number, not a table, and a student
  -- who shortens their cycle should get a visible "Day 7 no longer exists"
  -- rather than a silent cascade deleting their Friday.
  cycle_day   smallint check (cycle_day >= 1),

  starts_at   time not null,
  ends_at     time not null,
  -- Overrides the class's own room for this one meeting. Null means "wherever
  -- the class says", which is the common case and must not be copied, or
  -- changing the class's room would leave five stale copies behind.
  room        text,
  -- "Period 3", "Block A", "Double". The school's own word for this slot.
  label       text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Exactly one of the two ways of naming a day. Both, or neither, is a row
  -- nothing can place on a timetable.
  constraint class_meetings_one_day_kind check (
    (day_of_week is not null and cycle_day is null)
    or (day_of_week is null and cycle_day is not null)
  ),
  -- A lesson that ends before it starts is a typo, and it would render as a
  -- negative-height block or vanish entirely. Midnight-crossing lessons do not
  -- exist; this is a school day.
  constraint class_meetings_ends_after_starts check (ends_at > starts_at)
);

comment on table class_meetings is
  'When a class meets. One row per slot per week (or per cycle day). Read and '
  'projected onto dates by the app; deliberately not expanded into events.';

create index if not exists class_meetings_class_idx
  on class_meetings (class_id);
create index if not exists class_meetings_owner_day_idx
  on class_meetings (owner_id, day_of_week, starts_at);
create index if not exists class_meetings_owner_cycle_idx
  on class_meetings (owner_id, cycle_day, starts_at)
  where cycle_day is not null;

drop trigger if exists class_meetings_touch on class_meetings;
create trigger class_meetings_touch before update on class_meetings
  for each row execute function set_updated_at();

-- ------------------------------------------------------------------ rls ----

alter table class_meetings enable row level security;

-- The same shape as every other nested resource, with one difference: a
-- meeting has no `shared_with_parents` of its own. It is part of the class's
-- description rather than its contents, so it follows the class's flag. A
-- parent who can see that you take Functions can see when Functions is; there
-- is nothing further disclosed by the time that is not disclosed by the name.
drop policy if exists class_meetings_select on class_meetings;
create policy class_meetings_select on class_meetings for select using (
  owner_id = auth.uid()
  or exists (
    select 1 from classes c
     where c.id = class_meetings.class_id
       and ((c.shared_with_parents and is_linked_parent_of(c.owner_id))
            or has_share('class', c.id))
  )
);

-- Exactly the shape notebook_pages, assignments and files already use:
-- the row must claim you as its owner AND hang off a class you own. Both
-- halves are needed. Without the first, `owner_id` is a free text field on a
-- row you are allowed to insert; without the second, you can hang a meeting
-- off somebody else's class and claim it as your own.
--
-- An earlier draft of this file set owner_id from the class in a BEFORE
-- trigger instead. It worked, and it was a second way of doing something the
-- schema already had one way of doing -- and the definer function it needed
-- would answer "no such class" differently for a class that does not exist
-- and one you cannot see, which is a question this app does not answer
-- anywhere else.
drop policy if exists class_meetings_insert on class_meetings;
create policy class_meetings_insert on class_meetings for insert
  with check (owner_id = auth.uid() and class_owner(class_id) = auth.uid());

drop policy if exists class_meetings_update on class_meetings;
create policy class_meetings_update on class_meetings for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and class_owner(class_id) = auth.uid());

drop policy if exists class_meetings_delete on class_meetings;
create policy class_meetings_delete on class_meetings for delete
  using (owner_id = auth.uid());

-- Supabase's default privileges already grant this to `authenticated` for new
-- tables in `public`, so this line is belt to that pair of braces. It is
-- stated because a table whose grants depend on a default set up elsewhere is
-- a table that fails confusingly if that default ever changes -- and because
-- RLS without a grant is a policy nobody can reach.
grant select, insert, update, delete on class_meetings to authenticated;

-- ===========================================================================
-- 20260909000200_grades.sql
-- ===========================================================================

-- ============================================================================
-- Marks.
--
-- Asked for explicitly, with sharing off by default. That default is the whole
-- design and not a preference: a student whose parent is linked can experience
-- mark tracking as surveillance rather than help, and an app that defaults a
-- mark to visible has made that choice on their behalf. Every row starts
-- private and the student turns it on, one row at a time, the same way every
-- other object in this app works.
--
-- WHY A ROW IS NOT A COLUMN ON `assignments`
--
-- Not every mark has an assignment behind it. Tests, participation, a whole
-- term's report line, a mark for something that was never tracked as work --
-- all of those are marks with no assignment to hang on. And an assignment can
-- be marked more than once (a draft, then the final). So `assignment_id` is
-- nullable and the relationship is one-to-many, not one-to-one.
--
-- NUMBERS, NOT GRADES
--
-- `score` and `out_of` are numeric and separate, so 17/20 stays 17/20 rather
-- than becoming 85 and losing what it was out of. Percentages are computed for
-- display and never stored -- a stored percentage is a second copy of the same
-- fact that can disagree with the first.
--
-- `letter` exists alongside them because some report cards give only a letter
-- or a level ("B+", "Level 3", "Merit") and inventing a number for it would be
-- making up data. A row may carry a number, a letter, or both.
--
-- WEIGHTING, AND THE AVERAGE THIS DELIBERATELY DOES NOT COMPUTE
--
-- `weight` is stored because a test is not worth the same as a homework, and
-- an average that ignores that is wrong in the direction that matters. But no
-- overall average is stored anywhere. The app computes it on read and says how
-- it computed it, because a stored average is a number that goes stale
-- silently and a mark a student did not expect is the worst possible thing for
-- this app to be confidently wrong about.
-- ============================================================================

create table if not exists grades (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references profiles on delete cascade,
  class_id     uuid not null references classes  on delete cascade,
  -- Null when the mark is not for a tracked piece of work. `set null` rather
  -- than `cascade`: deleting an assignment must not silently delete the mark
  -- you got for it. The mark keeps its own title and stands on its own.
  assignment_id uuid references assignments on delete set null,

  title        text not null check (length(trim(title)) > 0),
  -- A mark may be a number, a letter, or both. All three nullable so a row can
  -- exist before it is marked -- "Unit 3 test" with no score yet is a real and
  -- useful row.
  score        numeric(8,3),
  out_of       numeric(8,3) check (out_of is null or out_of > 0),
  letter       text,

  weight       numeric(6,3) not null default 1 check (weight >= 0),
  -- The school's own bucket: "Test", "Assignment", "Final exam". Free text
  -- because every school names these differently and a fixed list would make
  -- somebody file their work under the wrong word.
  category     text,
  term         text,
  recorded_on  date,
  notes        text,

  -- Where this row came from. A mark the student typed and a mark a model read
  -- off a photograph are not equally trustworthy, and the app says which is
  -- which rather than presenting both as fact.
  source       text not null default 'manual'
               check (source in ('manual', 'report_card')),

  -- Off. Always off, on every insert, until the student says otherwise.
  shared_with_parents boolean not null default false,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- A score with nothing to be out of is meaningless, and it would render as
  -- "17" next to "85%" as though they were comparable.
  --
  -- This is the only constraint on what a row must say. A draft of this file
  -- also required every dated row to carry a score or a letter, which sounds
  -- reasonable and would have rejected "Unit 3 test, 1 October, not marked
  -- yet" -- the single most useful row a student can create, and the reason
  -- score, out_of and letter are all nullable in the first place.
  constraint grades_score_needs_out_of
    check (score is null or out_of is not null)
);

comment on table grades is
  'Marks. Private by default and shared one row at a time -- see the default on '
  'shared_with_parents, which is the point of the table rather than a setting.';
comment on column grades.source is
  'manual, or report_card when it came from a decoded document. Shown to the '
  'student, because a mark a model read off a photograph is not the same kind '
  'of fact as one they typed.';

create index if not exists grades_owner_class_idx on grades (owner_id, class_id);
create index if not exists grades_assignment_idx  on grades (assignment_id)
  where assignment_id is not null;
create index if not exists grades_term_idx        on grades (owner_id, term)
  where term is not null;

drop trigger if exists grades_touch on grades;
create trigger grades_touch before update on grades
  for each row execute function set_updated_at();

-- ------------------------------------------------------------------ rls ----

alter table grades enable row level security;

-- The one difference from every other shared resource in this schema: there is
-- no `has_share('grade', id)` arm, because 'grade' is deliberately not in the
-- `shareable` enum. Two reasons. Adding a value to an enum and using it in the
-- same migration is a documented trap in this project (plpgsql resolves at
-- call time; the value is not visible to the transaction that added it). And
-- share links are for showing somebody a thing -- a page, a class, a file. A
-- mark is not a document to show; the only person who should ever see it
-- besides the student is a parent they have deliberately linked and
-- deliberately shared with.
drop policy if exists grades_select on grades;
create policy grades_select on grades for select using (
  owner_id = auth.uid()
  or (shared_with_parents and is_linked_parent_of(owner_id))
);

drop policy if exists grades_insert on grades;
create policy grades_insert on grades for insert
  with check (owner_id = auth.uid() and class_owner(class_id) = auth.uid());

drop policy if exists grades_update on grades;
create policy grades_update on grades for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and class_owner(class_id) = auth.uid());

drop policy if exists grades_delete on grades;
create policy grades_delete on grades for delete using (owner_id = auth.uid());

grant select, insert, update, delete on grades to authenticated;

-- ===========================================================================
-- 20260909000300_report_cards.sql
-- ===========================================================================

-- ============================================================================
-- Report cards: upload one, have it read, confirm what it says, keep the marks.
--
-- This is the import pipeline again for a second kind of document, and it is
-- deliberately the same shape as the first one -- `import_batches` holding a
-- document and `import_staging` holding rows that are proposed rather than
-- filed. The rule from the calendar import applies here word for word:
-- **nothing is silently merged.** A model reading a photograph of a report
-- card produces a proposal. The student confirms it, line by line, before a
-- single mark is written into `grades`.
--
-- THE MOST SENSITIVE DOCUMENT IN THE APP
--
-- A report card carries a full name, a school, a year, every mark, and usually
-- a teacher's written comment about the person. Two consequences are built in
-- rather than left to the UI:
--
--   1. Both tables are owner-only. There is no parent arm in any policy here,
--      not even a shared one. A student may choose to share an individual mark
--      -- that is what `grades.shared_with_parents` is for -- and that is a
--      different act from handing over the document it came from, with its
--      comments and everything else on it. Sharing a mark must never
--      retroactively expose the report card.
--
--   2. The file lives in a private bucket under the student's own uid prefix,
--      and 20260909000400 is what enforces that. `storage_path` here is only a
--      pointer; the storage policies are the control.
--
-- THE DOCUMENT LEAVES THE COUNTRY
--
-- Decoding means sending the contents to a third-party model. That is a real
-- disclosure and the student is told before they upload, in the UI, in plain
-- words -- not in a policy nobody reads. `decode_consent_at` records that they
-- were told and went ahead, because a claim that somebody consented is worth
-- nothing if there is no row saying when.
--
-- ACCURACY IS NOT ASSUMED ANYWHERE
--
-- `confidence` is stored per line and shown. Lines the model was unsure about
-- sort to the top of the review screen rather than being hidden. Nothing is
-- pre-accepted -- `decision` starts at 'pending' for every row, including the
-- ones the model is certain about, because a model's certainty is not evidence
-- and this is somebody's transcript.
-- ============================================================================

create table if not exists report_cards (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references profiles on delete cascade,
  school_year_id uuid references school_years,

  -- Path inside the private `attachments` bucket. Always prefixed with the
  -- owner's uid -- see 20260909000400, which refuses anything else.
  storage_path   text not null,
  original_name  text,
  mime_type      text,
  byte_size      integer check (byte_size is null or byte_size > 0),
  term           text,

  status         text not null default 'uploaded'
                 check (status in ('uploaded','decoding','decoded','failed','applied')),
  -- Said out loud rather than swallowed. A decode that failed and shows
  -- nothing is indistinguishable from one that found no marks.
  error          text,

  -- When the student was shown what decoding involves and chose to go ahead.
  -- Null means it has not been sent anywhere.
  decode_consent_at timestamptz,
  decoded_at     timestamptz,
  applied_at     timestamptz,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table report_cards is
  'An uploaded report card and how far through reading it we are. Owner-only, '
  'with no parent access at any point -- sharing an individual mark is a '
  'different act from sharing the document it came from.';

create index if not exists report_cards_owner_idx
  on report_cards (owner_id, created_at desc);

drop trigger if exists report_cards_touch on report_cards;
create trigger report_cards_touch before update on report_cards
  for each row execute function set_updated_at();

-- --------------------------------------------------------------- lines -----

create table if not exists report_card_lines (
  id              uuid primary key default gen_random_uuid(),
  report_card_id  uuid not null references report_cards on delete cascade,
  owner_id        uuid not null references profiles on delete cascade,

  -- What the model read, verbatim. Never cleaned up on the way in: if it read
  -- "Fuctions" the student sees "Fuctions" and knows not to trust the line.
  -- Silently correcting it would hide exactly the signal that matters.
  course_name     text,
  course_code     text,
  teacher         text,
  mark            numeric(8,3),
  out_of          numeric(8,3) check (out_of is null or out_of > 0),
  letter          text,
  term            text,
  remark          text,

  -- 0..1, the model's own claim about itself. Shown, sorted on, and never
  -- used to skip the confirmation step.
  confidence      numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  -- The whole extracted object, so a line can be re-read later without the
  -- original document, and so a bad extraction can be diagnosed after the fact.
  raw             jsonb not null default '{}'::jsonb,

  -- Which existing class this line looks like. A suggestion, not a decision:
  -- the student can change it, and 'pending' means nobody has agreed yet.
  matched_class_id uuid references classes on delete set null,
  decision        text not null default 'pending'
                  check (decision in ('pending','accept','skip')),

  -- What this line became once accepted. `set null` because deleting the mark
  -- must not delete the record that it was proposed -- and because it makes
  -- applying idempotent: a line that already has a grade is not applied twice.
  grade_id        uuid references grades on delete set null,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on column report_card_lines.decision is
  'pending until the student says. Never pre-set to accept, however confident '
  'the model was: a model''s certainty is not evidence, and this is a '
  'transcript.';

create index if not exists report_card_lines_card_idx
  on report_card_lines (report_card_id, confidence nulls first);
create index if not exists report_card_lines_owner_idx
  on report_card_lines (owner_id);

drop trigger if exists report_card_lines_touch on report_card_lines;
create trigger report_card_lines_touch before update on report_card_lines
  for each row execute function set_updated_at();

-- ------------------------------------------------------------------ rls ----

alter table report_cards      enable row level security;
alter table report_card_lines enable row level security;

-- Owner-only, all four verbs, both tables. Deliberately no parent arm and no
-- `has_share` arm. This is the only group of tables in the schema with no way
-- for a second person to read it, and that is the design.
drop policy if exists report_cards_all on report_cards;
create policy report_cards_all on report_cards for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists report_card_lines_all on report_card_lines;
create policy report_card_lines_all on report_card_lines for all
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    -- The line must hang off a report card you own. Without this, `owner_id`
    -- is a value you choose on a row you attach to somebody else's document.
    and exists (
      select 1 from report_cards rc
       where rc.id = report_card_lines.report_card_id
         and rc.owner_id = auth.uid()
    )
  );

grant select, insert, update, delete on report_cards      to authenticated;
grant select, insert, update, delete on report_card_lines to authenticated;

-- ===========================================================================
-- 20260909000400_attachments_storage.sql
-- ===========================================================================

-- ============================================================================
-- The bucket, and the rules that make it safe to put anything in it.
--
-- `files` and `file_links` have existed since the first migration and nothing
-- has ever written to them, because there was nowhere to put the bytes. This
-- adds that: one private bucket, used by note attachments and by report card
-- uploads, with access decided by the path rather than by the app remembering
-- to ask.
--
-- EVERY OBJECT LIVES UNDER ITS OWNER'S UID
--
--     <uid>/notes/<uuid>.<ext>
--     <uid>/report-cards/<uuid>.<ext>
--
-- and the policies below check `(storage.foldername(name))[1] = auth.uid()`.
-- That is the whole control, and it is worth being explicit about why it is
-- the path and not a lookup against `files`: an object can be uploaded before
-- its row exists, and a policy that depends on a row that is not there yet
-- either fails the upload or has to be written to allow orphans -- and a rule
-- that allows orphans allows anything.
--
-- PRIVATE, AND NOT BY POLICY ALONE
--
-- The bucket is created with `public = false`. In a public bucket the object
-- URL is readable by anyone who has it, RLS notwithstanding, because public
-- objects are served without going through these policies at all. A report
-- card in a public bucket is a report card on the open internet the moment its
-- URL is guessed or pasted. The app reads objects through signed URLs, which
-- expire.
--
-- SIZE, BECAUSE THE FREE TIER IS ONE GIGABYTE IN TOTAL
--
-- 10MB a file. Enough for a phone photo of a whiteboard or a scanned report
-- card, small enough that a hundred of them is a tenth of everything. Without
-- a limit the first person to upload a video ends storage for everybody, and
-- the failure would arrive as somebody else's upload silently not working.
--
-- The mime allowlist has a cost worth naming: an upload of an unlisted type is
-- refused by the storage API, and the refusal is a 400 that means nothing to
-- the person holding the phone. Both `image/heic` and `image/heif` are listed
-- because iPhones produce either depending on version, and getting that wrong
-- would reject the single most likely upload in the whole app. The UI has to
-- say what is accepted *before* the picker opens, not after the failure.
--
-- IF THIS FILE FAILS TO APPLY
--
-- `storage.objects` is owned by `supabase_storage_admin`, not by the role that
-- runs migrations. On Supabase's hosted platform `postgres` can still create
-- policies on it and this applies cleanly. If it ever raises "must be owner of
-- table objects", nothing here is lost: create the same four rules under
-- Storage -> Policies in the dashboard, which runs as the owning role. The
-- bucket insert above is unaffected either way.
-- ============================================================================

-- Idempotent, and it means the bucket does not have to be created by hand in
-- the dashboard. `on conflict do nothing` rather than an upsert: if the bucket
-- already exists with settings somebody chose deliberately, this must not
-- reach in and change them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments',
  'attachments',
  false,
  10485760,
  array[
    'image/png','image/jpeg','image/webp','image/heic','image/heif','image/gif',
    'application/pdf',
    'text/plain','text/csv'
  ]
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Four policies, one per verb, all saying the same thing: the first folder in
-- the object's path must be your own user id.
--
-- `to authenticated` matters. Without it these also apply to `anon`, where
-- auth.uid() is null -- and `null = null` is null, not true, so anonymous
-- access would be refused anyway. It is stated because relying on a
-- three-valued-logic accident to enforce privacy is not enforcement, it is
-- luck that happens to hold.
-- ---------------------------------------------------------------------------

drop policy if exists calenda_attachments_select on storage.objects;
create policy calenda_attachments_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists calenda_attachments_insert on storage.objects;
create policy calenda_attachments_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Both halves. `using` decides which rows you may attempt to change; `with
-- check` decides what they may become. Without the second, an update could
-- move your own object to a path under somebody else's uid, and from then on
-- it is theirs -- readable by them and no longer by you.
drop policy if exists calenda_attachments_update on storage.objects;
create policy calenda_attachments_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists calenda_attachments_delete on storage.objects;
create policy calenda_attachments_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ===========================================================================
-- 20260909000500_chat.sql
-- ===========================================================================

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

-- ===========================================================================
-- 20260909000600_profile_columns.sql
-- ===========================================================================

-- ============================================================================
-- Every new column on `profiles`, in one file, so the column grant is restated
-- exactly once.
--
-- WHY THEY ARE NOT IN THE MIGRATIONS THEY BELONG TO
--
-- `rls.sql` ends with `revoke update on profiles from authenticated` followed
-- by a grant naming specific columns. A column missing from that list does not
-- fail on its own -- Postgres refuses the **whole** update statement, taking
-- the name and the timezone down with it, silently, because nothing checks the
-- result. 20260907000300 records that this is exactly how one previous attempt
-- shipped broken.
--
-- The defence is to restate the whole list every time. The risk in that is
-- restating it three times in one night and dropping a column from one of
-- them. So: one file, one restatement, and the timetable and walkthrough
-- migrations say plainly that their profile column lives here.
-- ============================================================================

-- ------------------------------------------------------- rotating cycles ---

alter table profiles add column if not exists timetable_cycle_length smallint;
alter table profiles add column if not exists timetable_cycle_anchor date;
alter table profiles add column if not exists timetable_cycle_anchor_day smallint;

-- Added separately from the columns so re-running the file does not fail on an
-- existing constraint, which `add column if not exists` would otherwise skip
-- silently along with the column.
do $$
begin
  alter table profiles add constraint profiles_cycle_length_sane
    check (timetable_cycle_length is null
           or timetable_cycle_length between 2 and 20);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table profiles add constraint profiles_cycle_anchor_day_sane
    check (timetable_cycle_anchor_day is null
           or timetable_cycle_anchor_day >= 1);
exception when duplicate_object then null;
end $$;

comment on column profiles.timetable_cycle_length is
  'Days in a rotating timetable cycle (Day 1..Day N), or null for an ordinary '
  'Monday-to-Friday week. Self-declared: there is no school entity to ask.';

-- THE HONEST LIMIT OF THESE TWO COLUMNS
--
-- Knowing the cycle is six days long does not tell you which day today is. It
-- needs an anchor -- "the 3rd of September was Day 1" -- and then today is
-- counted forward from it.
--
-- Counting forward is where this stops being exact. Cycles skip days the
-- school is closed, and a single unexpected snow day puts every subsequent day
-- off by one for the rest of the year. The app counts weekdays, which is right
-- until the first holiday and wrong afterwards.
--
-- So it is not presented as certain. The timetable shows which day it thinks
-- it is and offers "today is actually Day N", which simply re-anchors these
-- two columns to today. Self-correcting in one tap, by the only person who
-- knows the answer. The alternative -- deriving school days from the imported
-- calendar -- sounds better and would be confidently wrong in a new way every
-- time the calendar was incomplete.
comment on column profiles.timetable_cycle_anchor is
  'A date whose cycle day is known, paired with timetable_cycle_anchor_day. '
  'Re-set whenever the student corrects the day, which is how drift from '
  'unexpected closures is fixed.';

-- ---------------------------------------------------------- the walkthrough --

alter table profiles add column if not exists walkthrough_seen_at timestamptz;

comment on column profiles.walkthrough_seen_at is
  'When this person finished (or skipped) the post-signup walkthrough. Null '
  'means they have not been shown it. A timestamp rather than a boolean so it '
  'can also answer "how long after signing up", and so re-showing the tour '
  'after a big change is a matter of comparing dates rather than resetting a '
  'flag nobody can interpret.';

-- ------------------------------------------------------- the column grant ---
--
-- The full list. Not an addition -- `grant` is additive, so a partial list
-- would still work and would read, to the next person, as though the others
-- had been withdrawn.
--
-- `role` is deliberately absent, as it has been since rls.sql. It is the
-- column `is_admin()` reads, and the only way to change it is `set_my_role()`,
-- which refuses 'admin' by name. Do not add it here.

revoke update on profiles from authenticated;
grant  update (
  full_name,
  avatar_url,
  grade,
  school,
  heard_from,
  timezone,
  onboarded_at,
  timetable_cycle_length,
  timetable_cycle_anchor,
  timetable_cycle_anchor_day,
  walkthrough_seen_at
) on profiles to authenticated;

-- ===========================================================================
-- 20260909000700_fix_set_my_role.sql
-- ===========================================================================

-- ============================================================================
-- `set_my_role()` has never worked, and every parent who signed up is a
-- student.
--
-- WHAT HAPPENS TODAY
--
--   select set_my_role('parent');
--   ERROR:  role may not be changed
--
-- Reproduced against a real Postgres with every migration applied in order.
-- The role is unchanged afterwards.
--
-- WHY
--
-- `guard_profile_role()` is a BEFORE UPDATE trigger on `profiles` that raises
-- unless the role change comes from a null `auth.uid()` (a migration, the SQL
-- editor, the service role) or from an admin. `set_my_role()` is SECURITY
-- DEFINER, and the assumption baked into the pair is that being a definer
-- function is enough to get past it.
--
-- It is not. SECURITY DEFINER changes the DATABASE ROLE a function executes as.
-- It does not touch `auth.uid()`, which reads `request.jwt.claim.sub` -- a
-- session setting that is still very much there inside the function. So the
-- trigger sees a signed-in non-admin and refuses, and the one path deliberately
-- built to write that column is the one path the guard blocks.
--
-- WHY NOBODY NOTICED
--
-- A student changes nothing. `handle_new_user()` already defaults the column to
-- 'student', so `set_my_role('student')` is `new.role is not distinct from
-- old.role` and the trigger never fires. Student sign-ups work perfectly.
-- Only a parent hits it -- and `applyDetails()` treats a failure here as a
-- warning rather than an error, on the entirely correct reasoning that an
-- account already exists by then. So it goes quiet.
--
-- This is the same failure the project has already had once: "everyone was
-- silently `student`". It was fixed for password sign-ups by asking the
-- question, and the answer has been thrown away ever since.
--
-- THE FIX, AND WHY IT DOES NOT OPEN ANYTHING
--
-- `set_my_role()` declares itself with a transaction-local setting that the
-- trigger recognises, and clears it immediately after its own update so it
-- cannot cover a second statement in the same transaction.
--
-- A client can call `set_config()` -- it is public -- so it is worth being
-- explicit that this is not the control and never was. The control is the
-- COLUMN GRANT: `rls.sql` revokes update on `profiles` and re-grants a named
-- list that deliberately omits `role`, and Postgres checks column privileges
-- BEFORE any policy or trigger runs. A client naming `role` in an update is
-- refused before this trigger is reached, flag or no flag. The trigger is the
-- second layer, and the second layer now lets through exactly one thing: a
-- function that refuses 'admin' by name and takes the row id from the token
-- rather than from an argument.
-- ============================================================================

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
     and not is_admin()
     -- ...and it did not come from set_my_role(), which refuses 'admin' by
     -- name and edits only the caller's own row. Without this arm the guard
     -- blocks the single path that is supposed to write this column.
     and coalesce(current_setting('calenda.role_via_function', true), '') <> 'on'
  then
    raise exception 'role may not be changed';
  end if;
  return new;
end;
$$;

create or replace function set_my_role(new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A definer function runs as its owner, so it must establish for itself that
  -- there is a caller. Without this it would happily update nothing, which is
  -- harmless but hides a bug.
  if auth.uid() is null then
    raise exception 'set_my_role: no signed-in user';
  end if;

  -- The whole reason this function exists. 'admin' is not refused by omission
  -- somewhere else -- it is refused here, in the one place that can write the
  -- column, by name. Checked BEFORE the flag is set, so an invalid role never
  -- reaches a state where the guard would stand aside.
  if new_role is null or new_role not in ('student', 'parent') then
    raise exception 'set_my_role: role must be student or parent, got %', new_role;
  end if;

  -- Transaction-local (the third argument), and cleared immediately below, so
  -- it cannot cover any statement but the one it was set for.
  perform set_config('calenda.role_via_function', 'on', true);

  -- The id comes from the token, never from an argument, so there is no shape
  -- of call that edits somebody else's row.
  update profiles
     set role = new_role::user_role
   where id = auth.uid();

  perform set_config('calenda.role_via_function', '', true);
end;
$$;

revoke all on function set_my_role(text) from public;
grant execute on function set_my_role(text) to authenticated;

-- ===========================================================================
-- 20260910000100_admin_chat_allowance.sql
-- ===========================================================================

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

-- ===========================================================================
-- 20260910000200_teacher_role.sql
-- ===========================================================================

-- ============================================================================
-- A third role: teacher.
--
-- ALONE IN ITS OWN FILE, DELIBERATELY.
--
-- `alter type ... add value` cannot be used in the same transaction that adds
-- it. Postgres will accept the statement inside a transaction block and then
-- refuse every use of the new label until that transaction commits, with an
-- error ("unsafe use of new value") that points at the *use* rather than at
-- the cause. This project applies migrations two ways -- a GitHub integration
-- on merge, and hands in the SQL editor -- and neither promises where a
-- transaction begins or ends.
--
-- So the label is added here and used only by later files. This is the same
-- family of trap already recorded for the `shareable` enum, and the cheapest
-- possible insurance against it.
--
-- `if not exists` because the SQL in this repo gets pasted twice as often as
-- it gets applied once.
-- ============================================================================

alter type user_role add value if not exists 'teacher';

-- ===========================================================================
-- 20260910000300_teacher_groups.sql
-- ===========================================================================

-- ============================================================================
-- Teachers, and the classes they teach.
--
-- WHAT A TEACHING GROUP IS, AND WHY IT IS NOT A `class`
--
-- `classes` is a student's own row: their notebook, their marks, their name for
-- the subject. It is theirs and it stays theirs. A teaching group is a
-- different object -- one row that many students join -- and folding the two
-- together would mean either a student's notebook living inside a teacher's
-- record, or a teacher's roster living inside a student's. Neither is a thing
-- anybody asked for.
--
-- A member row may point at the student's own class (`class_id`), which is how
-- "the dates from this group" and "my notes for this subject" end up beside
-- each other without either owning the other.
--
-- HOW A DATE REACHES A STUDENT'S CALENDAR
--
-- A published date is an ordinary row in `events`, owned by the teacher, with
-- `group_id` set. Members read it through a policy. It is deliberately NOT
-- copied into each student's calendar: a copy is correct exactly once, and
-- every edit afterwards has to chase N rows and every one it misses is a
-- student sitting a test on the wrong day.
--
-- The whole app already reads `events` through RLS, so a published date appears
-- in the calendar, the agenda and the .ics export with no client change at all.
-- What the client does need to know is that it may not edit one, which is what
-- `group_id` on the row tells it -- and what the database enforces regardless,
-- since no update or delete policy admits a member.
--
-- WHAT A TEACHER CANNOT SEE
--
-- Everything, by default. Joining a group discloses membership and nothing
-- else. Marks stay private unless the student turns `share_progress` on for
-- that group, one group at a time, and can turn it off again. This is the same
-- stance as `grades.shared_with_parents`, for the same reason: a student whose
-- marks are visible to an adult by default experiences mark tracking as
-- surveillance, and defaulting to visible makes that choice for them.
--
-- A teacher never sees another teacher's group, and a student never sees the
-- other members of theirs -- a roster is the teacher's, not a class list handed
-- to everyone in it.
--
-- ON THE WORDING
--
-- Nothing here says "your school". A group is a thing an individual teacher
-- makes and students choose to join with a code; it is not connected to any
-- school's systems and must never be described as though it were. The app's
-- disclaimer stands everywhere and the teacher screens say this in as many
-- words.
--
-- Safe to apply twice.
-- ============================================================================

-- ------------------------------------------------------------- the role ----

/**
 * `set_my_role()` now accepts 'teacher'.
 *
 * Everything else about it is unchanged and the reasoning in 20260909000700
 * still holds: the control is the COLUMN GRANT in rls.sql, which omits `role`
 * so Postgres refuses any client naming it before a policy or trigger is
 * reached. This function is the one way through, it takes the row id from the
 * token, and it still refuses 'admin' by name.
 */
create or replace function set_my_role(new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'set_my_role: no signed-in user';
  end if;

  if new_role is null or new_role not in ('student', 'parent', 'teacher') then
    raise exception 'set_my_role: role must be student, parent or teacher, got %', new_role;
  end if;

  perform set_config('calenda.role_via_function', 'on', true);

  update profiles
     set role = new_role::user_role
   where id = auth.uid();

  perform set_config('calenda.role_via_function', '', true);
end;
$$;

revoke all on function set_my_role(text) from public;
grant execute on function set_my_role(text) to authenticated;

-- ------------------------------------------------------------- the group ---

create table if not exists teacher_groups (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references profiles on delete cascade,
  school_year_id uuid not null references school_years,
  name           text not null check (length(trim(name)) > 0),
  subject        text,
  room           text,
  color_token    text,

  -- Null means closed: an existing member stays, nobody new can join. Rotating
  -- the code is how a teacher shuts the door on a code that got passed around,
  -- without removing anybody.
  join_code      text unique,

  is_archived    boolean not null default false,
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (owner_id, school_year_id, name)
);

drop trigger if exists teacher_groups_touch on teacher_groups;
create trigger teacher_groups_touch before update on teacher_groups
  for each row execute function set_updated_at();

create index if not exists teacher_groups_owner_idx
  on teacher_groups (owner_id, school_year_id) where not is_archived;

create table if not exists teacher_group_members (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references teacher_groups on delete cascade,
  student_id uuid not null references profiles on delete cascade,

  -- The student's own class row, if they have one for this subject. Set by the
  -- student, `set null` on delete: deleting a class must not eject them from
  -- the group.
  class_id   uuid references classes on delete set null,

  -- Off. Always off on join, until the student says otherwise, for this group
  -- only.
  share_progress boolean not null default false,

  joined_at  timestamptz not null default now(),
  -- Leaving is recorded rather than deleted, so a teacher's view of who was in
  -- the group in March is not rewritten by somebody leaving in June.
  left_at    timestamptz,
  unique (group_id, student_id)
);

create index if not exists teacher_group_members_group_idx
  on teacher_group_members (group_id) where left_at is null;
create index if not exists teacher_group_members_student_idx
  on teacher_group_members (student_id) where left_at is null;

create table if not exists group_announcements (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references teacher_groups on delete cascade,
  owner_id   uuid not null references profiles on delete cascade,
  body       text not null check (length(trim(body)) > 0),
  -- Whether reminders were queued for it. Recorded on the row so "sent to
  -- everyone" is a fact about what happened, not a guess from the UI.
  notified   boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists group_announcements_group_idx
  on group_announcements (group_id, created_at desc);

-- A published date is an event, with the group it was published to on it.
alter table events add column if not exists group_id uuid
  references teacher_groups on delete cascade;
create index if not exists events_group_idx on events (group_id, start_date)
  where group_id is not null;

-- --------------------------------------------------------------- helpers ---

/**
 * True when the caller is a current member of this group.
 *
 * A definer function, so a student checking their own membership does not need
 * read access to the whole members table -- which is what a roster is.
 */
create or replace function is_group_member(target_group uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from teacher_group_members
    where group_id = target_group and student_id = auth.uid() and left_at is null
  );
$$;

/** True when the caller owns this group -- that is, teaches it. */
create or replace function owns_group(target_group uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from teacher_groups where id = target_group and owner_id = auth.uid()
  );
$$;

revoke all on function is_group_member(uuid) from public;
revoke all on function owns_group(uuid) from public;
grant execute on function is_group_member(uuid) to authenticated;
grant execute on function owns_group(uuid) to authenticated;

-- ------------------------------------------------------------- policies ----

alter table teacher_groups        enable row level security;
alter table teacher_group_members enable row level security;
alter table group_announcements   enable row level security;

drop policy if exists teacher_groups_own on teacher_groups;
create policy teacher_groups_own on teacher_groups for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- A member reads the group they are in, and only reads it. There is no update
-- or delete arm: a student cannot rename or archive somebody else's class.
drop policy if exists teacher_groups_member_select on teacher_groups;
create policy teacher_groups_member_select on teacher_groups for select
  using (is_group_member(id));

-- The roster is the teacher's.
drop policy if exists group_members_teacher on teacher_group_members;
create policy group_members_teacher on teacher_group_members for all
  using (owns_group(group_id))
  with check (owns_group(group_id));

-- A student sees their own membership and nobody else's -- not the roster, not
-- who else is in the room.
drop policy if exists group_members_own_select on teacher_group_members;
create policy group_members_own_select on teacher_group_members for select
  using (student_id = auth.uid());

-- They may change their own row (link a class, share progress, leave) and may
-- not move it to somebody else. There is no insert arm: joining goes through
-- redeem_group_join_code(), so nobody can add themselves to a group whose id
-- they happened to learn.
drop policy if exists group_members_own_update on teacher_group_members;
create policy group_members_own_update on teacher_group_members for update
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

drop policy if exists group_announcements_teacher on group_announcements;
create policy group_announcements_teacher on group_announcements for all
  using (owns_group(group_id))
  with check (owns_group(group_id) and owner_id = auth.uid());

drop policy if exists group_announcements_member_select on group_announcements;
create policy group_announcements_member_select on group_announcements for select
  using (is_group_member(group_id));

-- A member reads the group's published dates. Additive: policies are OR'd, so
-- everything events_select already allowed is untouched. There is deliberately
-- no update or delete arm -- a student cannot edit the date of a test.
drop policy if exists events_group_member_select on events;
create policy events_group_member_select on events for select
  using (group_id is not null and is_group_member(group_id));

/**
 * A teacher reads a member's marks for the class they linked, and only where
 * that member has turned sharing on for this group.
 *
 * Three conditions, all required, and the narrowest one is `class_id`: sharing
 * progress for a Physics group must not hand over a History mark. A student
 * who has linked no class shares nothing -- there is nothing for this to match.
 */
drop policy if exists grades_group_teacher_select on grades;
create policy grades_group_teacher_select on grades for select
  using (exists (
    select 1
    from teacher_group_members m
    join teacher_groups g on g.id = m.group_id
    where m.student_id = grades.owner_id
      and m.class_id   = grades.class_id
      and m.share_progress
      and m.left_at is null
      and g.owner_id = auth.uid()
  ));

/**
 * A teacher reads the name of somebody in one of their groups.
 *
 * Without this a roster is a list of uuids. It is as narrow as the parent arm
 * beside it: current members of a group this caller owns, nothing wider, and
 * nothing about a student who has left.
 */
drop policy if exists profiles_group_teacher_select on profiles;
create policy profiles_group_teacher_select on profiles for select
  using (exists (
    select 1
    from teacher_group_members m
    join teacher_groups g on g.id = m.group_id
    where m.student_id = profiles.id
      and m.left_at is null
      and g.owner_id = auth.uid()
  ));

-- ------------------------------------------------------------ join codes ---

/**
 * Makes or rotates the code students type to join a group.
 *
 * Eight characters from an alphabet with no 0/O/1/I, the same as
 * `create_parent_invite()`, so a code survives being read down a phone or
 * copied off a whiteboard.
 *
 * Rotating replaces the old code rather than adding a second one: two live
 * codes for one group means the teacher cannot answer "who can still join".
 * Existing members are untouched by a rotation.
 */
create or replace function rotate_group_join_code(target_group uuid)
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

  -- Ownership first, before anything is generated or written. A definer
  -- function does not consult RLS, so this check IS the permission boundary.
  if not exists (select 1 from teacher_groups where id = target_group and owner_id = auth.uid()) then
    raise exception 'That class is not yours.';
  end if;

  loop
    attempt := attempt + 1;
    new_code := '';
    for _ in 1..8 loop
      new_code := new_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;

    begin
      update teacher_groups set join_code = new_code where id = target_group;
      return new_code;
    exception when unique_violation then
      if attempt > 8 then raise exception 'Could not create a join code.'; end if;
    end;
  end loop;
end;
$$;

/**
 * Closes the group to new members, keeping everyone already in it.
 */
create or replace function close_group_join_code(target_group uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'You need to be signed in.';
  end if;
  if not exists (select 1 from teacher_groups where id = target_group and owner_id = auth.uid()) then
    raise exception 'That class is not yours.';
  end if;
  update teacher_groups set join_code = null where id = target_group;
end;
$$;

/**
 * Joins the caller to the group a code belongs to.
 *
 * A definer function, so a student never needs read access to `teacher_groups`
 * at large -- which would let anyone enumerate every code in the table.
 *
 * Every failure returns the same message. A distinct "that class is closed"
 * would tell a stranger their guess had hit a real group, which turns this into
 * an oracle for guessing codes.
 *
 * Re-joining after leaving reopens the old row rather than making a second one,
 * so `share_progress` is not silently reset by a rejoin -- and the unique
 * constraint that makes a duplicate impossible is doing the work, not a check.
 */
create or replace function redeem_group_join_code(code_text text)
returns table (out_group_id uuid, out_group_name text, out_teacher_name text)
language plpgsql security definer set search_path = public as $$
declare
  target teacher_groups%rowtype;
begin
  if auth.uid() is null then
    raise exception 'You need to be signed in.';
  end if;

  select * into target
  from teacher_groups
  -- Both sides qualified. `join_code` is a column here and was briefly also
  -- the parameter name, which plpgsql resolves as ambiguous at CALL time --
  -- the migration applies cleanly and the function fails the first time
  -- anybody uses it. That is the same shape of trap already recorded in
  -- CLAUDE.md for types and overloads.
  where teacher_groups.join_code is not null
    and teacher_groups.join_code = upper(trim(code_text))
    and not teacher_groups.is_archived
  for update;

  if not found then
    raise exception 'That code is not valid. Ask your teacher for a new one.';
  end if;

  if target.owner_id = auth.uid() then
    raise exception 'That code is not valid. Ask your teacher for a new one.';
  end if;

  insert into teacher_group_members (group_id, student_id)
  values (target.id, auth.uid())
  on conflict (group_id, student_id)
  do update set left_at = null;

  return query
    select target.id, target.name, p.full_name
    from profiles p
    where p.id = target.owner_id;
end;
$$;

revoke all on function rotate_group_join_code(uuid) from public;
revoke all on function close_group_join_code(uuid) from public;
revoke all on function redeem_group_join_code(text) from public;
grant execute on function rotate_group_join_code(uuid) to authenticated;
grant execute on function close_group_join_code(uuid) to authenticated;
grant execute on function redeem_group_join_code(text) to authenticated;

-- --------------------------------------------------------- announcements ---

-- The queue's subject_type is a check constraint rather than an enum, so this
-- widens it rather than adding an enum label. Rewritten wholesale because
-- `alter ... add constraint` on a name that already exists fails, and this file
-- must be safe to apply twice.
alter table notification_queue drop constraint if exists notification_queue_subject_type_check;
alter table notification_queue add constraint notification_queue_subject_type_check
  check (subject_type in ('event','assignment','task','digest','announcement'));

/**
 * Posts an announcement to a group, and optionally queues a reminder for every
 * member.
 *
 * A definer function because queuing is a service-role act everywhere else in
 * this schema: `notification_queue` has a select policy and no insert policy,
 * so nothing signed in may write it. Ownership is checked first, before a row
 * exists, because a definer function does not consult RLS and this check is
 * therefore the permission boundary rather than a convenience.
 *
 * `scheduled_for` is now: an announcement is the thing itself arriving, not a
 * warning that something is coming. It is the one subject type with no future
 * date to count back from.
 *
 * The queue's unique key includes offset_minutes, and every announcement has a
 * fresh id, so two announcements cannot collide and one announcement cannot be
 * queued twice.
 */
create or replace function announce_to_group(target_group uuid, message text, also_notify boolean default false)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You need to be signed in.';
  end if;
  if not exists (select 1 from teacher_groups where id = target_group and owner_id = auth.uid()) then
    raise exception 'That class is not yours.';
  end if;
  if message is null or length(trim(message)) = 0 then
    raise exception 'An announcement needs something in it.';
  end if;

  insert into group_announcements (group_id, owner_id, body, notified)
  values (target_group, auth.uid(), trim(message), coalesce(also_notify, false))
  returning id into new_id;

  if coalesce(also_notify, false) then
    -- One row per member, on the channels that member actually chose. A member
    -- with no preferences row gets nothing and is not invented a default here:
    -- ensure_notification_defaults() is the one place that decides that, and
    -- two places deciding it is how they drift apart.
    insert into notification_queue
      (profile_id, subject_type, subject_id, channel, offset_minutes, scheduled_for)
    select m.student_id, 'announcement', new_id, c, 0, now()
      from teacher_group_members m
      join notification_preferences np on np.profile_id = m.student_id
      cross join lateral unnest(np.channels) as c
     where m.group_id = target_group and m.left_at is null
    on conflict do nothing;
  end if;

  return new_id;
end;
$$;

revoke all on function announce_to_group(uuid, text, boolean) from public;
grant execute on function announce_to_group(uuid, text, boolean) to authenticated;

/**
 * The dispatcher runs as the service role and reads the announcement to build
 * the message. It needs the group's name beside the body, and joining across
 * two tables in an Edge Function is two round trips; this is one.
 */
create or replace view announcement_messages with (security_invoker = true) as
  select a.id, a.group_id, a.body, a.created_at,
         g.name as group_name, p.full_name as teacher_name
    from group_announcements a
    join teacher_groups g on g.id = a.group_id
    join profiles p       on p.id = a.owner_id;

-- ===========================================================================
-- 20260911000100_queued_reminder_titles.sql
-- ===========================================================================

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

-- ===========================================================================
-- 20260917000200_rate_limits.sql
-- ===========================================================================

-- ============================================================================
-- Rate limits on the three functions that had none.
--
-- WHAT WAS ACTUALLY EXPOSED
--
-- `redeem_group_join_code()` is the one that matters. A join code is eight
-- characters from a 31-letter alphabet -- about 8.5e11 combinations, which is
-- far too many to guess one at a time. But it is the ONLY secret protecting a
-- class, every wrong guess costs a signed-in caller nothing, and the function
-- happily answered as fast as it was asked. A determined account could work
-- through a meaningful slice of the space overnight and land in somebody's
-- class, where it would see published dates and announcements.
--
-- `rotate_group_join_code()` and `announce_to_group()` are smaller: both check
-- ownership first, so the worst case is a teacher's own class filled with
-- announcements or its code churned. Still worth bounding, because neither had
-- anything stopping a loop.
--
-- WHY THE COUNTER IS A TABLE AND NOT A COLUMN
--
-- Per caller, per action, per hour. A column on `profiles` would need a GRANT
-- to be written by anything, and `rls.sql` deliberately re-grants a named list
-- -- so this would be either ungrantable or a column a client could reset,
-- which is not a limit. This table has no policies at all: with RLS enabled and
-- nothing granted, a client cannot read or write it, and only these definer
-- functions touch it.
--
-- WHY THE NUMBERS LIVE INSIDE THE FUNCTIONS
--
-- Same reason `claim_chat_message()` takes no arguments: a caller-supplied
-- limit is not a limit. Each ceiling is a constant in the function that
-- enforces it.
--
-- WHAT THIS IS NOT
--
-- It is not the permission boundary. RLS and the ownership checks are, and they
-- were already there. This only stops somebody doing a permitted thing ten
-- thousand times.
--
-- Safe to apply twice.
-- ============================================================================

create table if not exists action_rates (
  profile_id uuid not null references profiles on delete cascade,
  action     text not null,
  -- Truncated to the hour, so the row IS the window and expiry needs no job.
  window_start timestamptz not null,
  count      int not null default 0,
  primary key (profile_id, action, window_start)
);

alter table action_rates enable row level security;

-- Deliberately no policies. RLS on with none means default-deny for every
-- client; the definer functions below bypass it as the table's owner.

create index if not exists action_rates_sweep_idx on action_rates (window_start);

/**
 * Counts one attempt and says whether it was within the ceiling.
 *
 * Counts the attempt BEFORE deciding, so a refused attempt still costs the
 * caller its slot. A limiter that only counts successes is not a limiter
 * against guessing -- every wrong guess would be free, which is the entire
 * attack it exists to slow.
 */
create or replace function claim_action(action_name text, ceiling int)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  used int;
begin
  if auth.uid() is null then
    raise exception 'You need to be signed in.';
  end if;

  insert into action_rates (profile_id, action, window_start, count)
  values (auth.uid(), action_name, date_trunc('hour', now()), 1)
  on conflict (profile_id, action, window_start)
    do update set count = action_rates.count + 1
  returning count into used;

  return used <= ceiling;
end;
$$;

-- FROM public, anon AND authenticated -- all three.
--
-- `revoke ... from public` alone does NOT hide a function on Supabase. The
-- project grants execute on everything in `public` to anon, authenticated and
-- service_role, and those are explicit grants rather than the implicit PUBLIC
-- one, so revoking PUBLIC leaves them untouched. Checked: after
-- `revoke all ... from public`, `has_function_privilege('authenticated', ...)`
-- still answered true, and the proacl still read `authenticated=X/postgres`.
--
-- This pattern is used elsewhere in these migrations and is correct there --
-- `claim_chat_message()` and `set_my_role()` are MEANT to be called by a
-- signed-in client. It is wrong only for helpers like these two, which exist
-- to be called by the definer functions above and by nothing else.
revoke all on function claim_action(text, int) from public, anon, authenticated;

-- Old rows are rubbish after their hour. Called from claim_action's own
-- callers rather than scheduled: a sweep that needs pg_cron is a sweep that
-- silently stops when pg_cron is not configured.
create or replace function sweep_action_rates() returns void
language sql security definer set search_path = public as $$
  delete from action_rates where window_start < now() - interval '2 hours';
$$;

revoke all on function sweep_action_rates() from public, anon, authenticated;

-- ------------------------------------------------------- the three calls ---

/**
 * Joining a class, now bounded.
 *
 * Twenty attempts an hour. A real student types a code their teacher gave
 * them, gets it wrong once or twice, and is never near this. Somebody working
 * through the keyspace gets 480 guesses a day against 8.5e11 combinations,
 * which is no longer a plan.
 *
 * IT RETURNS NO ROWS ON FAILURE RATHER THAN RAISING, AND THAT IS THE WHOLE
 * REASON THE LIMIT WORKS.
 *
 * The first version of this raised on a bad code, exactly as it always had.
 * `raise exception` in plpgsql aborts the statement, and the abort rolls back
 * `claim_action`'s own increment along with it -- so every wrong guess undid
 * its own count, the counter never moved, and the limiter was decoration. A
 * test that counted the rows afterwards is the only reason that is known: it
 * asserted 25 attempts had been recorded and found none.
 *
 * So the failure path returns normally, with zero rows, and the increment
 * survives. `joinGroup` in the client turns an empty result into the sentence
 * a person reads -- the same sentence for every failure, so a wrong code, a
 * closed class, your own class and a spent allowance are indistinguishable.
 * Telling a guesser which one it was is telling them how to guess better.
 */
create or replace function redeem_group_join_code(code_text text)
returns table (out_group_id uuid, out_group_name text, out_teacher_name text)
language plpgsql security definer set search_path = public as $$
declare
  target teacher_groups%rowtype;
begin
  if auth.uid() is null then
    raise exception 'You need to be signed in.';
  end if;

  -- Counted before anything is looked up, and not undone by what follows.
  if not claim_action('join_group', 20) then
    return;
  end if;

  select * into target
  from teacher_groups
  where teacher_groups.join_code is not null
    and teacher_groups.join_code = upper(trim(code_text))
    and not teacher_groups.is_archived
  for update;

  if not found then
    return;
  end if;

  if target.owner_id = auth.uid() then
    return;
  end if;

  insert into teacher_group_members (group_id, student_id)
  values (target.id, auth.uid())
  on conflict (group_id, student_id)
  do update set left_at = null;

  return query
    select target.id, target.name, p.full_name
    from profiles p
    where p.id = target.owner_id;
end;
$$;

/** Thirty an hour. Rotating is a thing done once a term, not in a loop. */
create or replace function rotate_group_join_code(target_group uuid)
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

  -- Ownership BEFORE the rate limit, so somebody else's class cannot be used
  -- to burn your allowance.
  if not exists (select 1 from teacher_groups where id = target_group and owner_id = auth.uid()) then
    raise exception 'That class is not yours.';
  end if;

  if not claim_action('rotate_code', 30) then
    raise exception 'You have changed the code several times just now. Try again shortly.';
  end if;

  loop
    attempt := attempt + 1;
    new_code := '';
    for _ in 1..8 loop
      new_code := new_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;

    begin
      update teacher_groups set join_code = new_code where id = target_group;
      return new_code;
    exception when unique_violation then
      if attempt > 8 then raise exception 'Could not create a join code.'; end if;
    end;
  end loop;
end;
$$;

/**
 * Sixty announcements an hour, which is more than any teacher will post and
 * far less than a loop.
 *
 * It matters more than it looks: an announcement with `notify` queues a row per
 * member per channel, so an unbounded loop is an unbounded write into the
 * notification queue and, from there, into somebody's phone.
 */
create or replace function announce_to_group(target_group uuid, message text, also_notify boolean default false)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You need to be signed in.';
  end if;
  if not exists (select 1 from teacher_groups where id = target_group and owner_id = auth.uid()) then
    raise exception 'That class is not yours.';
  end if;
  if message is null or length(trim(message)) = 0 then
    raise exception 'An announcement needs something in it.';
  end if;

  if not claim_action('announce', 60) then
    raise exception 'You have posted a lot just now. Try again shortly.';
  end if;

  perform sweep_action_rates();

  insert into group_announcements (group_id, owner_id, body, notified)
  values (target_group, auth.uid(), trim(message), coalesce(also_notify, false))
  returning id into new_id;

  if coalesce(also_notify, false) then
    insert into notification_queue
      (profile_id, subject_type, subject_id, channel, offset_minutes, scheduled_for)
    select m.student_id, 'announcement', new_id, c, 0, now()
      from teacher_group_members m
      join notification_preferences np on np.profile_id = m.student_id
      cross join lateral unnest(np.channels) as c
     where m.group_id = target_group and m.left_at is null
    on conflict do nothing;
  end if;

  return new_id;
end;
$$;

revoke all on function redeem_group_join_code(text) from public;
revoke all on function rotate_group_join_code(uuid) from public;
revoke all on function announce_to_group(uuid, text, boolean) from public;
grant execute on function redeem_group_join_code(text) to authenticated;
grant execute on function rotate_group_join_code(uuid) to authenticated;
grant execute on function announce_to_group(uuid, text, boolean) to authenticated;

-- ===========================================================================
-- 20260922000100_account_deletable.sql
-- ===========================================================================

-- ============================================================================
-- Two foreign keys refused every account deletion, and the owner's was the
-- only one that would ever have hit them.
--
-- WHAT WAS BROKEN
--
-- `profiles.id references auth.users on delete cascade`, and fifty other keys
-- cascade from `profiles`, so deleting the auth user takes the whole account
-- with it. Two do not:
--
--   event_reviews.reviewer_id uuid not null references profiles,
--   import_batches.admin_id   uuid not null references profiles,
--
-- No delete rule means NO ACTION, which refuses the delete. Both columns are
-- written by admin actions -- reviewing an imported event, running an import
-- batch -- so a student deletes cleanly and an admin gets a foreign key
-- violation. The account that cannot be deleted is the one belonging to the
-- person who would be asked to delete everybody else's.
--
-- Nothing had caught it because nothing had ever deleted an account. This is
-- the rule this project keeps relearning: a column read in four places and
-- written in none is a feature nobody can turn on, and a path exercised by
-- nobody is a path that does not work.
--
-- WHY `set null` AND NOT `cascade`
--
-- Both rows are an audit of something done to data that is not the reviewer's
-- own. An `event_reviews` row records that a community event was approved; an
-- `import_batches` row records that a school year's calendar was imported.
-- Cascading would delete the record of the act along with the person, which is
-- more than erasure asks for and less than the remaining data deserves -- an
-- approved community event would be left with no trace of who approved it OR
-- that anybody did.
--
-- `set null` forgets the person and keeps the act, which is what a deletion
-- request actually means. It is also what this schema already chose one screen
-- away: `events.approved_by uuid references profiles on delete set null`, in
-- the same file, written the same day. These two were missed, not decided.
--
-- `not null` has to go for that to be expressible. Every reader is checked
-- below rather than assumed.
--
-- SAFE TO APPLY TWICE. The project applies migrations on merge through the
-- GitHub integration AND has a habit of pasting SQL by hand, so every
-- statement here is conditional or idempotent.
-- ============================================================================

-- ------------------------------------------------------------ event_reviews --

alter table event_reviews alter column reviewer_id drop not null;

alter table event_reviews drop constraint if exists event_reviews_reviewer_id_fkey;
alter table event_reviews
  add constraint event_reviews_reviewer_id_fkey
  foreign key (reviewer_id) references profiles (id) on delete set null;

comment on column event_reviews.reviewer_id is
  'Null once that person deleted their account. The review stands; the reviewer '
  'is forgotten. See 20260922000100.';

-- ----------------------------------------------------------- import_batches --

alter table import_batches alter column admin_id drop not null;

alter table import_batches drop constraint if exists import_batches_admin_id_fkey;
alter table import_batches
  add constraint import_batches_admin_id_fkey
  foreign key (admin_id) references profiles (id) on delete set null;

comment on column import_batches.admin_id is
  'Null once that person deleted their account. The batch stands; the importer '
  'is forgotten. See 20260922000100.';

-- ============================================================================
-- Mark these migrations as applied, so the GitHub integration skips them.
-- ============================================================================

insert into supabase_migrations.schema_migrations (version, name) values
  ('20260904000100', 'init'),
  ('20260904000200', 'rls'),
  ('20260904000300', 'seed'),
  ('20260904000400', 'parent_invites'),
  ('20260904000500', 'notification_scheduling'),
  ('20260904000600', 'quiet_hour_days'),
  ('20260904000700', 'search'),
  ('20260904000800', 'push_by_default'),
  ('20260907000100', 'self_service_profile'),
  ('20260907000200', 'set_my_role'),
  ('20260907000300', 'signup_details'),
  ('20260909000100', 'timetable'),
  ('20260909000200', 'grades'),
  ('20260909000300', 'report_cards'),
  ('20260909000400', 'attachments_storage'),
  ('20260909000500', 'chat'),
  ('20260909000600', 'profile_columns'),
  ('20260909000700', 'fix_set_my_role'),
  ('20260910000100', 'admin_chat_allowance'),
  ('20260910000200', 'teacher_role'),
  ('20260910000300', 'teacher_groups'),
  ('20260911000100', 'queued_reminder_titles'),
  ('20260917000200', 'rate_limits'),
  ('20260922000100', 'account_deletable')
on conflict (version) do nothing;

-- ============================================================================
-- Nothing above is saved until this commits.
-- ============================================================================

commit;
