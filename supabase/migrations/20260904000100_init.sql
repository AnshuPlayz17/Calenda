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
